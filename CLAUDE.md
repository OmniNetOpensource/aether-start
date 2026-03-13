# CLAUDE.md

This file gives Claude Code repository-specific guidance for working in this project.

## Project Overview

`aether-start` is a TanStack Start application deployed to Cloudflare Workers. It is primarily an authenticated AI chat product with:

- streaming chat over Cloudflare Agents / WebSocket
- multiple model backends and role presets
- conversation persistence in Cloudflare D1
- attachment storage in Cloudflare R2
- notes, sharing, prompt quota, and auth flows

The codebase is in the middle of a structure cleanup. Do not assume everything lives under `src/features/`. Right now:

- `src/features/chat/` contains the Redux chat request slice and commands
- much of the conversation tree, chat client orchestration, and UI still lives in `src/lib/`, `src/components/`, and `src/stores/zustand/`
- server logic lives under `src/server/`

## Commands

Use `pnpm` for everything.

- `pnpm install` - install dependencies
- `pnpm dev` - start local dev server on port 3000
- `pnpm build` - production build
- `pnpm lint` - run ESLint
- `pnpm type-check` - run TypeScript without emit
- `pnpm check` - run type-check, lint, and build
- `pnpm test` - run Vitest once
- `pnpm test:watch` - run Vitest in watch mode
- `pnpm test:coverage` - run coverage
- `pnpm test:e2e` - run Playwright tests
- `pnpm auth:generate` - regenerate Better Auth schema output
- `pnpm auth:migration:generate` - generate Better Auth migrations
- `pnpm cf:typegen` - regenerate Cloudflare worker typings
- `pnpm cf:migrate:local` - apply local D1 migrations
- `pnpm cf:migrate:remote` - apply remote D1 migrations
- `pnpm cf:deploy` - build and deploy to Cloudflare Workers
- `pnpm cf:sync-secrets` - sync env values to Cloudflare

## Current Architecture

### Routing

TanStack Start file routes live in `src/routes/`.

Important routes:

- `src/routes/__root.tsx` - root shell, theme loader, Redux provider, responsive provider, tooltip, toast, Sentry boundary
- `src/routes/index.tsx` - entry route
- `src/routes/app/route.tsx` - authenticated app shell with sidebar and chat room layout
- `src/routes/app/index.tsx` - new chat landing inside app
- `src/routes/app/c/$conversationId.tsx` - conversation page
- `src/routes/app/notes.tsx` - notes page
- `src/routes/auth/*.tsx` - auth pages
- `src/routes/share/$token.tsx` - public read-only shared conversation page
- `src/routes/api/assets/$key.ts` - private asset delivery from R2
- `src/routes/api/share-assets/$token/$attachmentId.ts` - public shared attachment delivery
- `src/routes/api/auth/$.ts` - Better Auth route handler
- `src/routes/api/sentry.ts` - Sentry endpoint

Do not edit `src/routeTree.gen.ts` manually.

### Frontend State

State is split on purpose:

- Redux store in `src/stores/redux/`
  - currently owns `chatRequest`
  - store factory: `src/stores/redux/createAppStore.ts`
- Zustand stores in `src/stores/zustand/`
  - conversation list
  - composer state
  - message tree
  - editing state
  - notes
  - toast

If you are changing request lifecycle or connection status, start in `src/features/chat/state/`.
If you are changing message tree, composer, or conversations, the logic is still mostly in Zustand and `src/lib/conversation/`.

### Chat Flow

The request lifecycle spans client UI, orchestrator code, and a Cloudflare Agent.

Main pieces:

- `src/features/chat/state/chatRequestSlice.ts` - request status, role list, connection state
- `src/features/chat/state/chatRequestCommands.ts` - UI-facing commands
- `src/lib/chat/api/chat-orchestrator.ts` - client chat session orchestration, sync/reconnect, route controller
- `src/lib/chat/api/event-handlers.ts` - applies streamed events to the message tree
- `src/server/agents/chat-agent.ts` - long-running server agent handling chat requests, sync, abort, persistence, quota, and tool loops

The client sends:

- `conversationHistory`
- selected `role`
- full tree snapshot
- local `requestId`

The agent returns:

- streaming content / thinking
- tool lifecycle events
- conversation update events
- terminal request status

The event contract lives in:

- `src/types/chat-api.ts`
- `src/types/chat-event-types.ts`

### Model Providers and Roles

This project is no longer Anthropic-only.

Provider adapters live in `src/server/agents/services/`:

- `anthropic.ts`
- `openai.ts`
- `openai-responses.ts`
- `gemini.ts`
- `provider-factory.ts`

Role and backend selection live in `src/features/chat/server/agents/services/model-provider-config.ts`.

`model-provider-config.ts` defines:

- role id and display name
- model name
- provider format
- backend mapping
- system prompt

Backend values currently include:

- `rightcode-claude`
- `rightcode-gemini`
- `rightcode-openai`
- `dmx`
- `ikun`

If you add a role, update `ROLE_CONFIGS`.
If you add a new backend or provider format, update both `model-provider-config.ts` and `provider-factory.ts`.

### Tool Calling

Tool execution lives in `src/server/agents/tools/`.

Current tools:

- `search`
- `fetch_url`

Important files:

- `src/server/agents/tools/executor.ts`
- `src/server/agents/tools/search.ts`
- `src/server/agents/tools/fetch.ts`
- `src/server/agents/tools/types.ts`

Tool availability is env-driven:

- `SERP_API_KEY` enables `search`
- `fetch_url` is always available (markdown via Jina Reader, image, youtube)

The agent can iterate model output and tool execution up to `MAX_ITERATIONS = 200`.

### Persistence and Server Functions

Server functions live in `src/server/functions/` and are the main frontend entrypoints for DB-backed actions.

Areas currently covered:

- conversations
- notes
- shares
- prompt quota
- theme
- text-to-speech
- auth
- admin redeem codes
- chat attachment upload
- chat title generation
- role listing

Database access lives in `src/server/db/`.

Important DB modules:

- `conversations-db.ts` - conversation CRUD, search, pinning
- `notes-db.ts` - notes CRUD
- `conversation-shares-db.ts` - public share tokens and attachment lookup
- `prompt-quota-db.ts` - quota tracking and redeem code consumption

Conversation persistence details that matter:

- data is user-scoped
- conversation metadata and bodies are split across tables
- search uses FTS when possible, with a contains fallback for CJK queries
- pinning affects list sort order
- `role` is persisted with the conversation

### Auth

Auth uses Better Auth with Drizzle + D1.

Important files:

- `src/server/functions/auth/auth.ts`
- `src/server/functions/auth/session.ts`
- `src/server/functions/auth/session-state.ts`
- `src/routes/api/auth/$.ts`

Current behavior includes:

- email/password auth
- email OTP plugin
- email verification
- password reset
- route protection for `/app`

### Sharing and Assets

Shared conversations are read-only snapshots, not live conversations.

Important files:

- `src/server/functions/shares.ts`
- `src/server/db/conversation-shares-db.ts`
- `src/routes/share/$token.tsx`
- `src/routes/api/share-assets/$token/$attachmentId.ts`

Attachment uploads and private asset access live in:

- `src/server/functions/chat/attachment-upload.ts`
- `src/routes/api/assets/$key.ts`

## Testing

Vitest:

- config: `vitest.config.ts`
- test files: `src/**/*.test.{ts,tsx}`
- environment: `happy-dom`

Playwright:

- config: `playwright.config.ts`
- test dir: `tests/e2e`

There are unit tests around chat orchestration, agent behavior, tools, stores, DB helpers, and route behavior. Prefer updating or adding tests near the touched module.

## Migrations

Migrations live in `migrations/`.

Current migration history includes:

- conversations
- Better Auth tables
- user scoping
- conversation role
- conversation search FTS
- notes
- prompt quota and redeem codes
- conversation pinning
- conversation shares

`0011_arena.sql` and `0012_drop_arena.sql` exist in history; treat them as historical migrations, not active features.

## Environment and Bindings

Environment values are read through `src/server/env.ts`, from Cloudflare bindings or `process.env`.

Common app secrets:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `ADMIN_EMAIL_ALLOWLIST`
- `RESEND_API_KEY`
- `SERP_API_KEY`
- `SUPADATA_API_KEY`
- `MINIMAX_API_KEY`
- `DMX_APIKEY`
- `DMX_BASEURL`
- `ANTHROPIC_API_KEY_RIGHTCODE`
- `ANTHROPIC_BASE_URL_RIGHTCODE`
- `GEMINI_API_KEY_RIGHTCODE`
- `GEMINI_BASE_URL_RIGHTCODE`
- `OPENAI_API_KEY_RIGHTCODE`
- `OPENAI_BASE_URL_RIGHTCODE`
- `ANTHROPIC_API_KEY_IKUNCODE`
- `ANTHROPIC_BASE_URL_IKUNCODE`

Cloudflare bindings:

- `DB` - D1
- `CHAT_ASSETS` - R2

## Code Style and Expectations

- TypeScript + React
- follow existing local style; the repository is not perfectly uniform yet
- do not introduce `useMemo`, `useCallback`, or `React.memo`
- prefer existing TanStack Start patterns for routes and server functions
- prefer existing store boundaries instead of inventing another state layer
- keep generated files generated

Generated or generated-like files to avoid hand-editing unless required:

- `src/routeTree.gen.ts`
- `worker-configuration.d.ts`
- Better Auth generated schema output, unless you are intentionally regenerating it

## Practical Guidance

When working on chat behavior, inspect all three layers before changing anything:

- UI command / store entry point
- `chat-orchestrator.ts`
- `chat-agent.ts`

When working on conversations, remember there are multiple linked concerns:

- conversation list store
- message tree store
- D1 persistence
- share snapshot sanitization
- search index update

When working on auth-gated app routes, preserve the redirect behavior in `src/routes/app/route.tsx`.

When working on public share routes, preserve the read-only and noindex behavior.

# 用户偏好

1.如果一个函数或者一个变量在文件里只被使用过一次，就不要单独写

2.代码要简单优雅，变量名要直观，始终保持可读性，始终拒绝抽象

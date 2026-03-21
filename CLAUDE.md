# CLAUDE.md

This file gives Claude Code repository-specific guidance for working in this project.

## Project Overview

`aether-start` is a TanStack Start application deployed to Cloudflare Workers. It is an authenticated AI chat product with:

- streaming chat over Cloudflare Agents / WebSocket
- multiple model providers and prompt presets
- conversation persistence in Cloudflare D1
- attachment storage in Cloudflare R2
- notes, shares, quota, and Better Auth flows
- artifact rendering and preview for HTML / React outputs

The codebase is feature-split, but imports still use compatibility aliases such as `@/server/*`, `@/lib/*`, and `@/types/*`. Those aliases do not always match the physical directory structure. Check `tsconfig.json` before assuming a module should live under `src/server/`.

## Commands

Use `pnpm` for everything.

- `pnpm install` - install dependencies
- `pnpm dev` - start local dev server on port 3000
- `pnpm build` - production build
- `pnpm lint` - run Oxlint
- `pnpm format` - format with Oxfmt
- `pnpm format:check` - verify formatting (Oxfmt, no writes)
- `pnpm type-check` - run TypeScript without emit
- `pnpm check` - run type-check, lint, format check, and build
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

### Physical Layout vs Alias Layout

The real server-side layout is feature-local:

- `src/features/chat/server/*`
- `src/features/sidebar/server/*`
- `src/features/share/server/*`
- `src/features/notes/server/*`
- `src/features/quota/server/*`
- `src/features/auth/server/*`
- `src/shared/server/*`

Important alias examples:

- `@/server/env` -> `src/shared/server/env.ts`
- `@/server/db/conversations-db` -> `src/features/sidebar/server/conversations-db.ts`
- `@/server/functions/conversations` -> `src/features/sidebar/server/conversations.ts`
- `@/server/functions/chat/*` -> `src/features/chat/server/functions/*`

If you do not check the alias mapping, it is easy to patch the wrong place.

### Routing

TanStack Start file routes live in `src/routes/`.

Important routes:

- `src/routes/__root.tsx` - root shell, theme loader, responsive provider, tooltip, toast, Sentry boundary
- `src/routes/index.tsx` - landing route
- `src/routes/app/route.tsx` - authenticated app shell
- `src/routes/app/index.tsx` - new chat landing
- `src/routes/app/c/$conversationId.tsx` - conversation page with artifact panel
- `src/routes/app/notes.tsx` - notes page
- `src/routes/auth/*.tsx` - auth pages
- `src/routes/share/$token.tsx` - public read-only shared conversation
- `src/routes/api/assets/$key.ts` - private asset delivery from R2
- `src/routes/api/share-assets/$token/$attachmentId.ts` - public shared attachment delivery
- `src/routes/api/auth/$.ts` - Better Auth route handler
- `src/routes/api/sentry.ts` - Sentry endpoint

Do not edit `src/routeTree.gen.ts` manually.

### Frontend State

State is store-based and centered on Zustand:

- `src/features/chat/store/useChatRequestStore.ts` - request status and live request lifecycle
- `src/features/chat/store/useComposerStore.ts` - composer UI state
- `src/features/chat/store/useEditingStore.ts` - message editing state
- `src/features/sidebar/store/useChatSessionStore.ts` - conversation tree, conversation list, selected model/prompt, artifact panel
- `src/features/notes/store/useNotesStore.ts` - notes state
- `src/shared/stores/toast.ts` - toast state

If the bug affects loaded conversation content, route transitions, branch state, or artifacts, inspect `useConversationLoader.ts` and `useChatSessionStore.ts` before changing UI components in isolation.

### Chat Flow

The request lifecycle spans client UI, orchestration code, event handling, and a Cloudflare Agent.

Main pieces:

- `src/features/chat/store/useChatRequestStore.ts`
- `src/features/chat/lib/api/chat-orchestrator.ts`
- `src/features/chat/lib/api/event-handlers.ts`
- `src/features/chat/server/agents/chat-agent.ts`

The stream contract lives in:

- `src/features/chat/types/chat-api.ts`
- `src/features/chat/types/chat-event-types.ts`

The event set now includes artifact events such as:

- `artifact_started`
- `artifact_title`
- `artifact_language`
- `artifact_code_delta`
- `artifact_completed`
- `artifact_failed`

### Artifacts

Artifact support is now part of the main chat experience.

Client-side:

- `src/features/chat/components/artifact/ArtifactPanel.tsx`
- `src/features/chat/components/artifact/preview-document.ts`
- `src/features/chat/components/artifact/preview-protocol.ts`
- `src/routes/app/c/$conversationId.tsx`

Server-side:

- `src/features/chat/server/agents/tools/render.ts`
- `src/features/chat/server/agents/services/render-artifact-stream.ts`
- `src/features/sidebar/server/conversations-db.ts`
- `migrations/0015_conversation_artifacts.sql`

`render` is a real model tool, not just a client affordance. If you change how artifacts stream, also check persistence, route loading, and delete/clear flows.

### Conversation State and Persistence

Conversation client state is split between:

- the route loader hook in `src/features/sidebar/hooks/useConversationLoader.ts`
- the session store in `src/features/sidebar/store/useChatSessionStore.ts`
- message-tree helpers in `src/features/sidebar/lib/tree/`

Conversation persistence lives in:

- `src/features/sidebar/server/conversations.ts` - server functions
- `src/features/sidebar/server/conversations-db.ts` - D1 helpers

Important behavior:

- conversations are user-scoped
- metadata and bodies are split across tables
- search uses FTS with a contains fallback for CJK queries
- pinning affects sort order
- role is persisted with the conversation
- artifacts are loaded together with conversation detail

### Model Providers, Models, and Prompts

This project is no longer Anthropic-only.

Provider adapters live in `src/features/chat/server/agents/services/`:

- `anthropic.ts`
- `openai.ts`
- `openai-responses.ts`
- `gemini.ts`
- `provider-factory.ts`

Model and prompt definitions live in `src/features/chat/server/agents/services/model-provider-config.ts`.
Availability server functions live in `src/features/chat/server/functions/models.ts`.
`src/features/chat/server/functions/roles.ts` is only a deprecated alias.

Supported provider formats currently include:

- `anthropic`
- `openai`
- `openai-responses`
- `gemini`

Current backends include:

- `rightcode-claude`
- `rightcode-claude-sale`
- `rightcode-gemini`
- `rightcode-openai`
- `dmx`
- `ikun`
- `ikun-gemini`
- `openrouter`
- `cubence-claude`, `cubence-gemini`, `cubence-openai` (shared `CUBENCE_API_KEY` / `CUBENCE_BASE_URL`)

If you add or rename a model/backend/provider, update `model-provider-config.ts` and the corresponding adapter/factory code together.

### Tool Calling

Tool execution lives in `src/features/chat/server/agents/tools/`.

Current tools:

- `fetch_url`
- `render`
- `search`

Availability rules:

- `render` is always available
- `fetch_url` is always available
- `search` requires `SERP_API_KEY`
- `fetch_url` may use `JINA_API_KEY` and `SUPADATA_API_KEY` depending on content type

Important files:

- `executor.ts`
- `fetch.ts`
- `render.ts`
- `search.ts`
- `types.ts`

### Feature-Local Server Functions

The frontend entrypoints are mostly TanStack server functions imported through aliases.

Key modules:

- conversations: `src/features/sidebar/server/conversations.ts`
- notes: `src/features/notes/server/notes.ts`
- shares: `src/features/share/server/shares.ts`
- quota: `src/features/quota/server/quota.ts`
- models/prompts: `src/features/chat/server/functions/models.ts`
- chat title / upload / tts: `src/features/chat/server/functions/*`
- auth/session: `src/features/auth/server/*`

### Auth

Auth uses Better Auth with Drizzle on D1.

Important files:

- `src/features/auth/server/auth.ts`
- `src/features/auth/server/session.ts`
- `src/features/auth/server/session-state.ts`
- `src/routes/api/auth/$.ts`

Current behavior includes:

- email/password auth
- email OTP
- email verification
- password reset
- registration IP capture
- last-login timestamp updates
- route protection for `/app`

### Sharing and Assets

Shared conversations are read-only snapshots, not live conversations.

Important files:

- `src/features/share/server/shares.ts`
- `src/features/share/server/conversation-shares-db.ts`
- `src/routes/share/$token.tsx`
- `src/routes/api/share-assets/$token/$attachmentId.ts`

Attachment uploads and private asset access live in:

- `src/routes/api/upload-attachment.ts`
- `src/routes/api/assets/$key.ts`

When working on share routes, preserve read-only behavior and asset safety checks.

## Testing

Vitest:

- config: `vitest.config.ts`
- test files: `src/**/*.test.{ts,tsx}`
- environment: `happy-dom`

Playwright:

- config: `playwright.config.ts`
- test dir: `tests/e2e`
- **Flexible auth / port**: optional `BETTER_AUTH_TRUSTED_ORIGINS` in `.env.local` — comma-separated origins (each entry expands `localhost` ↔ `127.0.0.1` for the same port). Use when the dev URL differs from `BETTER_AUTH_URL` (e.g. Playwright on another port).
- **Optional bundled dev server**: `E2E_WEB_SERVER=1 pnpm test:e2e` starts Vite on `E2E_PORT` (default `3010`) and sets `baseURL` to `http://127.0.0.1:<port>` unless `E2E_BASE_URL` is set. Add matching origins to `BETTER_AUTH_TRUSTED_ORIGINS` (e.g. `http://127.0.0.1:3010` or list one host; the other is paired automatically).

**Do not create new test files.** Only the existing 14 curated tests are kept; they cover message-tree, block-operations, chat-orchestrator, useMessageTreeStore, useConversationsStore, useEditingStore, chat-agent, render-artifact-stream, openai-responses, provider-error, executor, logger, preview-text, and MessageItem.

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
- conversation artifacts

`0011_arena.sql` and `0012_drop_arena.sql` remain historical migrations only.

## Environment and Bindings

Environment values are read through `src/shared/server/env.ts`, from Cloudflare bindings or `process.env`.

Important env keys include:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS` (optional; comma-separated extra origins for Better Auth)
- `ADMIN_EMAIL_ALLOWLIST`
- `RESEND_API_KEY`
- `SERP_API_KEY`
- `SUPADATA_API_KEY`
- `JINA_API_KEY`
- `LLM_STREAM_LOGGING`
- `LLM_STREAM_LOGGING_MAX_CHARS`
- `DMX_APIKEY`
- `DMX_BASEURL`
- `OPENROUTER_API_KEY`
- `CUBENCE_API_KEY`
- `CUBENCE_BASE_URL`
- `ANTHROPIC_API_KEY_RIGHTCODE`
- `ANTHROPIC_BASE_URL_RIGHTCODE`
- `ANTHROPIC_API_KEY_RIGHTCODE_SALE`
- `ANTHROPIC_BASE_URL_RIGHTCODE_SALE`
- `GEMINI_API_KEY_RIGHTCODE`
- `GEMINI_BASE_URL_RIGHTCODE`
- `OPENAI_API_KEY_RIGHTCODE`
- `OPENAI_BASE_URL_RIGHTCODE`
- `ANTHROPIC_API_KEY_IKUNCODE`
- `ANTHROPIC_BASE_URL_IKUNCODE`
- `GEMINI_API_KEY_IKUNCODE`
- `GEMINI_BASE_URL_IKUNCODE`

Cloudflare bindings:

- `DB` - D1
- `CHAT_ASSETS` - R2

## Code Style and Expectations

- TypeScript + React
- follow existing local style; most edited files use 2-space indentation and single quotes, though some newer files still use double quotes
- do not introduce `useMemo`, `useCallback`, or `React.memo`
- prefer existing TanStack Start patterns for routes and server functions
- prefer existing feature/store boundaries instead of inventing another state layer
- keep generated files generated

Generated or generated-like files to avoid hand-editing unless required:

- `src/routeTree.gen.ts`
- `worker-configuration.d.ts`
- `src/features/auth/server/auth.schema.ts`

## Practical Guidance

When working on chat behavior, inspect all linked layers before changing anything:

- client store entry point
- `chat-orchestrator.ts`
- `event-handlers.ts`
- `chat-agent.ts`

When working on conversations, remember the change can touch:

- conversation loader hook
- chat session store
- message tree helpers
- D1 persistence
- search index updates
- artifact hydration and cleanup
- share snapshot sanitization

When working on auth-gated app routes, preserve the redirect behavior in `src/routes/app/route.tsx`.

When working on public share routes, preserve read-only behavior and noindex semantics.

## 用户偏好

1. 如果一个函数或者一个变量在文件里只被使用过一次，就不要单独写。
2. 代码要简单优雅，变量名要直观，始终保持可读性，始终拒绝抽象。

## Code Standards

- Never typecast. Never use `as`

- DO NOT Calling setState synchronously within an effect body

- 用尽可能少的tailwind css 以及div来达成同样的效果

- write extremely easy to consume code, optimize for how easy the code is to read. make the code skimmable. avoid cleverness. use early returns.reduce the number of possible states a function can be in with distriminated unions, remove any optionality that is not actual optional, never pass params for overriding code except strictly necessary


- For React code, prefer modern patterns including useEffectEvent, startTransition, and useDeferredValue when appropriate if used by the team. Do not add useMemo /useCallback by default unless already used; follow the repo's React Compiler guidance.

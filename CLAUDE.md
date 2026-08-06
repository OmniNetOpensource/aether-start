# CLAUDE.md

This file gives Claude Code repository-specific guidance for working in this project.

## Project Overview

`aether-start` is a TanStack Start app deployed to Cloudflare Workers. The product is an authenticated AI chat app with:

- streaming chat over a Cloudflare Agent
- multi-provider model selection and prompt presets
- conversation persistence in Cloudflare D1
- attachment storage in Cloudflare R2
- artifact generation and preview for HTML output
- notes, sharing, settings, quota, and Better Auth flows
- client error logging persisted to D1

The repo is split by runtime. The only app alias in `tsconfig.json` is `@/* -> src/*`.

## Project Structure

- `src/routes/` contains TanStack Start file routes. Page routes are frontend entrypoints; `src/routes/api/` contains backend HTTP entrypoints.
- `src/routes/__root.tsx` wires auth gating for `/app` and `/note`, theme loading, responsive context, tooltip provider, toast container, and client error reporting.
- `src/routes/app/{-$conversationId}.tsx` owns the authenticated app shell, renders a new chat at `/app`, and loads an existing conversation at `/app/:conversationId`.
- `src/routes/share/$token.tsx` renders the public read-only share page.
- `src/routes/api/assets/$key.ts` serves private R2 assets.
- `src/routes/api/share-assets/$token/$attachmentId.ts` serves public shared assets.
- `src/routes/api/upload-attachment.ts` uploads attachments into R2.
- `src/routes/api/client-errors.ts` stores browser-side error reports in D1.
- `src/routes/api/auth/$.ts` is the Better Auth entrypoint.

Runtime boundaries:

- `src/frontend/` contains Solid components, signals, browser state, browser networking, the design system, and themes.
- `src/rpc/` contains `createServerFn` boundaries. RPC files validate input, authenticate, and call backend code.
- `src/backend/` contains Cloudflare Worker, D1, R2, Better Auth, Durable Object, model-provider, and tool execution code.
- `src/shared/` contains only runtime-independent types, schemas, and pure functions.

Dependency direction is enforced in `.oxlintrc.json`: frontend may import rpc and shared; rpc may import backend and shared; backend may import shared; shared may only import shared.

Generated files:

- `src/routeTree.gen.ts`
- `src/backend/auth/identity/auth.schema.ts`

Do not edit generated files by hand unless the task is specifically about regenerating them.

## Commands

Use `pnpm` for repo commands.

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm preview`
- `pnpm lint`
- `pnpm format`
- `pnpm format:check`
- `pnpm type-check`
- `pnpm check`
- `pnpm cf:typegen`
- `pnpm cf:migrate:local`
- `pnpm cf:migrate:remote`
- `pnpm cf:deploy`
- `pnpm cf:sync-secrets`

Auth generation scripts in `package.json` point to `src/backend/auth/identity/`.

## Current Architecture

### App Shell And Route Data

- `src/routes/app/route.tsx` preloads available models and prompts, prefetches the conversation list, and owns the app layout.
- `src/routes/app/index.tsx` renders a new conversation.
- `src/routes/app/$conversationId.tsx` loads a historical conversation.
- `src/frontend/conversations/conversation-list/Sidebar.tsx` owns the left sidebar UI.

### Chat Request Lifecycle

The request lifecycle spans both runtimes:

- `src/frontend/chat/agent-runtime/chat-orchestrator.ts` owns browser requests, reconnection, abort, resume, and SSE consumption.
- `src/frontend/chat/agent-runtime/event-handlers.ts` applies server events to frontend state.
- `src/backend/chat/agent/conversation-runner.ts` owns the Durable Object run.
- `src/backend/chat/agent/event-processor.ts` applies events to the persisted server snapshot.

### Conversation Session State

Important files:

- `src/frontend/conversations/session/` contains signals and query-cache state.
- `src/rpc/conversations.ts` exposes conversation RPC calls.
- `src/backend/conversations/conversations-db.ts` owns D1 persistence.
- `src/shared/conversations/` contains pure message-tree operations.

### Artifacts

Artifact support is part of the main chat experience.

Important files:

- `src/frontend/chat/artifact/ArtifactPanel.tsx`
- `src/frontend/chat/artifact/ArtifactToggleButton.tsx`
- `src/backend/chat/tools/render-tool.ts`
- `src/shared/chat/render-artifact-stream.ts`
- `src/backend/chat/tools/tool-executor.ts`
- `src/backend/conversations/conversations-db.ts`
- `migrations/0015_conversation_artifacts.sql`

Artifact events are defined in `src/shared/chat/chat-event-types.ts` and applied in `src/frontend/chat/agent-runtime/event-handlers.ts`.

### Models, Providers, And Backends

Model catalog files:

- `src/shared/chat/model-catalog.ts` contains model IDs, prompt definitions, and protocol parsing.
- `src/backend/chat/model-catalog/available-models.ts` fetches configured provider model resources.
- `src/rpc/chat-options.ts` exposes models and prompts to the SPA.

Provider runtime files:

- `src/backend/chat/providers/provider-factory.ts`
- `src/backend/chat/providers/anthropic.ts`
- `src/backend/chat/providers/openai.ts`
- `src/backend/chat/providers/openai-responses.ts`
- `src/backend/chat/providers/gemini.ts`

Supported formats currently include:

- `anthropic`
- `openai`
- `openai-responses`
- `gemini`

Configured backends currently include:

- `moonshot`
- `ikun`
- `openrouter`
- `gemini-aistudio`

### Tools

Tool execution lives in `src/backend/chat/tools/tool-executor.ts`.

Current tools:

- `fetch_url`
- `render`
- `search` when `SERP_API_KEY` is available

Tool implementations live in:

- `src/backend/chat/tools/fetch-tool.ts`
- `src/backend/chat/tools/render-tool.ts`
- `src/backend/chat/tools/search-tool.ts`
- `src/shared/chat/tool-types.ts`

### Auth

Important files:

- `src/frontend/auth/client.ts`
- `src/rpc/auth.ts`
- `src/backend/auth/identity/auth.ts`
- `src/backend/auth/identity/auth.schema.ts`
- `src/backend/auth/request.ts`
- `src/backend/auth/admin-access.ts`
- `src/routes/api/auth/$.ts`

Current behavior includes:

- email/password auth
- email OTP via Better Auth plugin
- email verification
- password reset
- registration IP capture
- last-login timestamp updates
- route protection for `/app` and `/note`
- trusted origin expansion for `localhost` and `127.0.0.1`

### Sharing

Sharing is snapshot-based and read-only.

Important files:

- `src/rpc/share.ts`
- `src/backend/share/conversation-shares-db.ts`
- `src/shared/share/`
- `src/frontend/share/share-dialog/ShareDialog.tsx`
- `src/routes/share/$token.tsx`

Public shares must stay read-only.

### Quota, Settings, Attachments

- Quota: `src/rpc/quota.ts`, `src/rpc/redeem-codes.ts`, `src/backend/quota/`
- Settings: `src/frontend/settings/settings-dialog/`, `src/frontend/settings/profile-menu/`
- Attachments: `src/frontend/attachments/` with R2 handlers under `src/routes/api/`

### Worker Env And Bindings

Worker env loading is centralized in:

- `src/backend/platform/cloudflare/env.ts`

Required bindings:

- `DB`
- `CHAT_ASSETS`

## Testing

Vitest tests are colocated with their owning frontend, backend, or shared modules. Run them with `pnpm test`.

## Migrations

Migrations live in `migrations/`.

The latest migrations currently include:

- `0015_conversation_artifacts.sql`
- `0016_client_error_logs.sql`
- `0017_conversation_meta_model.sql`

`0011_arena.sql` and `0012_drop_arena.sql` are historical only.

## Environment And Secrets

Important env keys include:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `ADMIN_EMAIL_ALLOWLIST`
- `RESEND_API_KEY`
- `SERP_API_KEY`
- `SUPADATA_API_KEY`
- `JINA_API_KEY`
- `LLM_STREAM_LOGGING`
- `LLM_STREAM_LOGGING_MAX_CHARS`
- `MOONSHOT_API_KEY`
- `ANTHROPIC_API_KEY_IKUNCODE`
- `OPENAI_API_KEY_IKUNCODE`
- `GEMINI_API_KEY_IKUNCODE`
- `GEMINI_BASE_URL_IKUNCODE`
- `GEMINI_API_KEY_AISTUDIO`
- `OPENROUTER_API_KEY`
- `NETIFY_TOKEN`

Never commit real secrets.

## Code Style And Expectations

- TypeScript + Solid
- follow the existing local style in the file you are editing
- keep code simple and readable
- prefer existing feature boundaries over adding a new abstraction layer
- do not introduce `useMemo`, `useCallback`, or `React.memo`
- keep `oxlint` and `tsc` clean
- do not edit generated files manually

## 用户偏好

1. 如果一个函数或者变量在文件里只用一次，就默认内联，不要独立。
2. 代码要简单、直观、好读，变量名要让人一眼看懂，拒绝为了抽象而抽象。
3. 不要写 fallback 或错误兜底代码。
4. 用尽可能少的代码完成需求。

## Code Standards

- Never typecast. Never use `as`.
- Do not call `setState` synchronously inside an effect body.
- 用尽可能少的 Tailwind CSS 和 `div` 达成同样效果。
- Write extremely easy to consume code. Optimize for readability. Keep code skimmable. Avoid cleverness. Use early returns. Reduce the number of possible states. Prefer discriminated unions when they simplify the code. Remove optionality that is not real optionality. Do not add override parameters unless they are strictly necessary.

- 能处理就处理，不能处理就别 catch——往上抛比假装没事好。catch 放在**有能力做出有意义响应的那一层**，不是每个函数都包一层。转化错误时保留原始信息（用 `cause`），别把底层细节直接扔给上层，也别把它丢掉。预期中的失败（网络断、输入非法）优雅降级；程序 bug 快速失败，别试图恢复一个你不理解的错误状态。异步错误必须有归宿，每个 Promise 都要有对应的 catch 或 await。不要用异常做流程控制，throw 是给异常情况用的。

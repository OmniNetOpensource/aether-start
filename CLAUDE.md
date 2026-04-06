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

The repo is feature-split. The only app alias in `tsconfig.json` is `@/* -> src/*`. Older docs that mention `@/server/*`, `@/lib/*`, or `@/types/*` are stale.

## Project Structure

- `src/routes/` contains TanStack Start file routes.
- `src/routes/__root.tsx` wires auth gating for `/app` and `/note`, theme loading, responsive context, tooltip provider, toast container, and client error reporting.
- `src/routes/app/route.tsx` is the authenticated app shell.
- `src/routes/app/c/$conversationId.tsx` loads a conversation into the client stores and resumes a running agent stream when needed.
- `src/routes/share/$token.tsx` renders the public read-only share page.
- `src/routes/api/assets/$key.ts` serves private R2 assets.
- `src/routes/api/share-assets/$token/$attachmentId.ts` serves public shared assets.
- `src/routes/api/upload-attachment.ts` uploads attachments into R2.
- `src/routes/api/client-errors.ts` stores browser-side error reports in D1.
- `src/routes/api/auth/$.ts` is the Better Auth entrypoint.

Top-level features now live here:

- `src/features/attachments/`
- `src/features/auth/`
- `src/features/chat/`
- `src/features/conversations/`
- `src/features/notes/`
- `src/features/quota/`
- `src/features/settings/`
- `src/features/share/`

Shared code now lives here:

- `src/shared/app-shell/`
- `src/shared/browser/`
- `src/shared/core/`
- `src/shared/design-system/`
- `src/shared/worker/`

Generated files:

- `src/routeTree.gen.ts`
- `src/features/auth/identity/auth.schema.ts`

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

Auth-related scripts still exist in `package.json`, but they currently point at legacy `src/features/auth/server/*` paths while the real auth code lives under `src/features/auth/identity/*`. Do not trust those paths blindly.

## Current Architecture

### App Shell And Route Data

- `src/routes/app/route.tsx` preloads available models and prompts, and prefetches the conversation list query.
- `src/features/conversations/route-data/app-shell-route-data.tsx` holds the loader data context for the app shell.
- `src/features/conversations/conversation-list/Sidebar.tsx` and related files own the left sidebar UI.

### Chat Request Lifecycle

The request lifecycle now spans these files:

- `src/features/chat/session/useChatRequestStore.ts`
- `src/features/chat/session/chat-orchestrator.ts`
- `src/features/chat/session/event-handlers.ts`
- `src/features/chat/agent-runtime/conversation-runner.ts`

If chat streaming, reconnection, abort, or resume behavior changes, inspect all four together.

### Conversation Session State

Conversation state no longer lives under `sidebar/`.

Important files:

- `src/features/conversations/session/useChatSessionStore.ts`
- `src/features/conversations/session/conversations.ts`
- `src/features/conversations/session/conversations-db.ts`
- `src/features/conversations/conversation-tree/`
- `src/routes/app/c/$conversationId.tsx`

`$conversationId.tsx` loads the conversation inline with `getConversationFn`. There is no `useConversationLoader.ts` anymore.

### Artifacts

Artifact support is part of the main chat experience.

Important files:

- `src/features/chat/artifact/ArtifactPanel.tsx`
- `src/features/chat/artifact/ArtifactToggleButton.tsx`
- `src/features/chat/artifact/render-tool.ts`
- `src/features/chat/artifact/render-artifact-stream.ts`
- `src/features/chat/agent-runtime/tool-executor.ts`
- `src/features/conversations/session/conversations-db.ts`
- `migrations/0015_conversation_artifacts.sql`

Artifact stream events are defined in `src/features/chat/session/chat-event-types.ts` and applied in `src/features/chat/session/event-handlers.ts`.

### Models, Providers, And Backends

Model catalog files:

- `src/features/chat/model-catalog/model-provider-config.ts`
- `src/features/chat/model-catalog/models.ts`

Provider runtime files:

- `src/features/chat/agent-runtime/providers/provider-factory.ts`
- `src/features/chat/agent-runtime/providers/anthropic.ts`
- `src/features/chat/agent-runtime/providers/openai.ts`
- `src/features/chat/agent-runtime/providers/openai-responses.ts`
- `src/features/chat/agent-runtime/providers/gemini.ts`

Supported formats currently include:

- `anthropic`
- `openai`
- `openai-responses`
- `gemini`

Configured backends currently include:

- `rightcode-claude`
- `rightcode-claude-sale`
- `rightcode-gemini`
- `rightcode-openai`
- `dmx`
- `ikun`
- `ikun-openai`
- `ikun-gemini`
- `openrouter`
- `cubence-claude`
- `cubence-gemini`
- `cubence-openai`

### Tools

Tool execution lives in `src/features/chat/agent-runtime/tool-executor.ts`.

Current tools:

- `fetch_url`
- `render`
- `search` when `SERP_API_KEY` is available

Tool implementations live in:

- `src/features/chat/agent-runtime/fetch-tool.ts`
- `src/features/chat/artifact/render-tool.ts`
- `src/features/chat/research/search-tool.ts`
- `src/features/chat/agent-runtime/tool-types.ts`

### Auth

Auth code now lives under `identity/` and `session/`, not `server/`.

Important files:

- `src/features/auth/identity/auth.ts`
- `src/features/auth/identity/auth.schema.ts`
- `src/features/auth/session/session.ts`
- `src/features/auth/session/session-state.ts`
- `src/features/auth/session/request.server.ts`
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

- `src/features/share/share-record/shares.ts`
- `src/features/share/share-record/conversation-shares-db.ts`
- `src/features/share/share-dialog/ShareDialog.tsx`
- `src/routes/share/$token.tsx`

Public shares must stay read-only.

### Notes, Quota, Settings, Attachments

- Notes: `src/features/notes/note-record/`, `src/features/notes/note-editor/`, `src/routes/note/index.tsx`
- Quota: `src/features/quota/quota-balance/`, `src/features/quota/redeem-code/`
- Settings: `src/features/settings/settings-dialog/`, `src/features/settings/profile-menu/`
- Attachments: `src/features/attachments/attachment-upload/`, `src/features/attachments/attachment-preview/`

### Worker Env And Bindings

Worker env loading is centralized in:

- `src/shared/worker/env.ts`
- `src/shared/worker/env.server.ts`

Required bindings:

- `DB`
- `CHAT_ASSETS`

## Testing

There is no automated test suite. `package.json` does not define a test script.

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
- `OPENAI_API_KEY_IKUNCODE`
- `GEMINI_API_KEY_IKUNCODE`
- `GEMINI_BASE_URL_IKUNCODE`
- `MINIMAX_API_KEY`
- `NETIFY_TOKEN`

Never commit real secrets.

## Code Style And Expectations

- TypeScript + React
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

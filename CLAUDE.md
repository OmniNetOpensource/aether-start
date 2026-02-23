# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aether-start is a full-stack AI chat application built with TanStack Start (React + file-based routing) and deployed to Cloudflare Workers. It integrates Anthropic Claude models, supports tool calling (search + URL fetch), message branching, markdown rendering, and conversation persistence via Cloudflare D1.

## Build & Development Commands

Use `pnpm` for all package management:

- `pnpm install` - Install dependencies
- `pnpm dev` - Start local dev server (port 3000)
- `pnpm build` - Build production bundle
- `pnpm check` - Run type-check, lint, and build together
- `pnpm cf:typegen` - Generate worker binding types
- `pnpm cf:migrate:local` - Apply local D1 migrations
- `pnpm cf:migrate:remote` - Apply remote D1 migrations
- `pnpm cf:deploy` - Build and deploy to Cloudflare Workers

## Architecture & Key Patterns

### Routing Structure
- Uses TanStack Start file-based routing in `src/routes/`
- UI routes include:
  - `src/routes/__root.tsx` - Root shell and providers
  - `src/routes/index.tsx` - Redirects to `/app`
  - `src/routes/app/route.tsx` - App layout with sidebar + chat room
  - `src/routes/app/index.tsx` - New chat page
  - `src/routes/app/c/$conversationId.tsx` - Conversation detail page
- API-style route handler for assets:
  - `src/routes/api/assets/$key.ts` - Serves R2 attachment objects

### Feature-Based Organization
Code is organized by feature in `src/features/`:
- `chat/` - Composer, message display/editing/research blocks, chat request flow
- `conversation/` - Message tree model, formatting, persistence repository/service
- `sidebar/` - Sidebar layout, history list, profile/settings
- `theme/` - Theme hook logic
- `responsive/` - Responsive context and server helpers

### Server Functions & Chat Architecture
Server-side chat logic is implemented via Cloudflare Durable Objects + WebSocket:
- `src/features/chat/api/server/agents/chat-agent.ts` - Durable Object agent for chat streaming
- `src/features/chat/api/server/functions/chat-title.ts` - Title generation
- `src/features/chat/api/server/functions/attachment-upload.ts` - Upload image attachments to R2
- `src/features/conversation/persistence/server/functions/conversations.ts` - D1 CRUD + pagination

### Chat Provider & Tooling
- Anthropic streaming implementation: `src/features/chat/api/server/services/anthropic.ts`
- Role/model config: `src/features/chat/api/server/services/chat-config.ts`
- Tool execution pipeline:
  - `src/features/chat/api/server/tools/execute.ts`
  - `src/features/chat/api/server/tools/registry.ts`
  - `src/features/chat/api/server/tools/search.ts`
  - `src/features/chat/api/server/tools/fetch.ts`
- Tool availability is environment-driven:
  - `search` enabled when `SERP_API_KEY` exists
  - `fetch_url` enabled when `JINA_API_KEY` exists (also exposed to model tools list in chat function)

### State Management
- Uses Zustand stores across features.
- Shared toast store in `src/shared/stores/toast.ts`
- Conversation store in `src/features/conversation/persistence/store/useConversationsStore.ts`
- Message tree/editing/composer/chat request each have feature-local stores.

### Shared Layer
- Shared reusable UI/components/hooks/utils live under `src/shared/`:
  - `src/shared/ui/` (Radix-based primitives)
  - `src/shared/components/` (Markdown, code block, image preview)
  - `src/shared/lib/` (navigation, utils)
  - `src/shared/hooks/` (toast)

## Data & Persistence

### Conversation Persistence
- Conversations are persisted in Cloudflare D1, not browser-only IndexedDB.
- Migrations are in `migrations/` (`0001_conversations.sql`, `0002_drop_bodies_updated_at.sql`).
- Repository abstraction:
  - `src/features/conversation/persistence/repository.ts`
  - `src/features/conversation/persistence/persist-service.ts` (throttled writes, dedup signature)
- Data model is split into metadata/body tables and reconstructed as `ConversationDetail`.

### Attachments
- Uploads go to Cloudflare R2 via `uploadAttachmentFn`.
- Stored key pattern starts with `chat-assets/`.
- Public fetch route is `GET /api/assets/$key` with safety checks and cache headers.

## API/Event Contract

### Chat Input
- Frontend sends serialized messages + role + optional conversationId to the chat agent via WebSocket.

### Streaming Events
`ChatServerToClientEvent` is defined in `src/features/chat/api/shared/event-types.ts` and includes:
- `content`, `thinking`
- `tool_call`, `tool_progress`, `tool_result`
- `conversation_created`, `conversation_updated`
- `error`

### Iterative Tool Loop
- Chat flow can iterate tool calls and continuation up to a capped iteration count (currently 200 in `chat-agent.ts`).

## Type System

- Chat-facing aliases are exported from `src/features/chat/types/chat.ts`.
- Canonical message/tree types live in:
  - `src/features/conversation/model/types/message.ts`
  - `src/features/conversation/model/types/conversation.ts`
- API payload/event types live in `src/features/chat/api/types/`.

## Configuration & Environment

### Local env (`.env.local`)
- `ANTHROPIC_API_KEY` (required for chat)
- `ANTHROPIC_BASE_URL` (optional proxy/base URL)
- `SERP_API_KEY` (enables search tool)
- `JINA_API_KEY` (enables fetch tool)
- `SUPADATA_API_KEY` (available in env layer)

### Cloudflare bindings (`wrangler.jsonc`)
- `DB` - D1 database binding
- `CHAT_ASSETS` - R2 bucket binding

## Styling

- Tailwind CSS v4 via `@tailwindcss/vite`
- Radix UI primitives wrapped in `src/shared/ui/`
- Markdown rendering via shared components (`Markdown`, `CodeBlock`, `MermaidBlock`)
- KaTeX styles injected from root route

## Code Style

- TypeScript + React
- Follow existing file-local style (the repository currently has mixed quote/semicolon style across files)
- Keep naming consistent:
  - Components: PascalCase
  - Hooks: `useX`
  - Stores: `*Store`
- Keep changes ESLint-clean; config is in `eslint.config.mjs`

## Common Patterns

### Add a New Tool
1. Create tool definition in `src/features/chat/api/server/tools/`
2. Export `{ spec, handler }` with tool schema and implementation
3. Register in `executor.ts` by adding to `getToolHandler` and `getAvailableTools`
4. Ensure tool progress/result events match existing client expectations

### Add a New Route
1. Add file under `src/routes/` with path-aligned naming
2. Use `createFileRoute()`
3. Export `Route` and component/server handlers as needed
4. Do not edit `src/routeTree.gen.ts` manually

### Work with Conversations/Messages
- Persist and fetch via `conversationRepository` instead of ad-hoc storage
- Preserve message tree fields (`id`, sibling/child links, `createdAt`) when transforming
- Use existing helpers in `conversation/model/tree/` for path/tree operations


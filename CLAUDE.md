# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aether-start is a full-stack AI chat application built with TanStack Start (React + file-based routing), integrating with Anthropic's Claude API. The app features a chat interface with tool calling capabilities (web search, URL fetching), conversation history, and markdown rendering with syntax highlighting.

## Build & Development Commands

Use `pnpm` for all package management:

- `pnpm install` - Install dependencies
- `pnpm dev` - Start dev server on port 3000
- `pnpm build` - Production build
- `pnpm preview` - Preview production build
- `pnpm test` - Run Vitest tests
- `pnpm lint` - Run ESLint
- `pnpm type-check` - TypeScript type checking
- `pnpm check` - Run type-check, lint, and build together

## Architecture & Key Patterns

### Routing Structure
- Uses TanStack Start with file-based routing in `src/app/`
- Route files: `index.tsx` (pages), `route.ts` (API endpoints)
- Dynamic segments use `$` prefix (e.g., `src/app/app/c/$conversationId.tsx`)
- API routes live in `src/app/api/` (e.g., `/api/chat`, `/api/chat/title`)
- Root layout: `src/app/__root.tsx`

### Feature-Based Organization
Code is organized by feature in `src/features/`:
- `chat/` - Main chat interface, message display, composer, tool result rendering
- `sidebar/` - Conversation history, profile menu, settings
- `theme/` - Theme management hooks
- `preview/` - Image/file preview functionality

### Provider System
`src/providers/` contains AI provider integrations:
- `anthropic.ts` - Anthropic Claude API integration with streaming
- `stream.ts` - Stream processing utilities
- `tools/` - Tool definitions (fetch_url, search) and execution
- `config.ts` - Model configuration and role management
- `logger.ts` - Conversation logging

The provider system uses async generators for streaming responses and supports tool calling with multi-turn conversations.

### State Management
- Zustand stores in `src/stores/` (e.g., `toast.ts`)
- Feature-specific stores in feature directories (e.g., `src/features/sidebar/store/useSidebarStore.ts`)

### Type System
- Core chat types in `src/features/chat/types/chat.ts`:
  - `Message` - Chat messages with blocks (content, attachments, research, errors)
  - `SerializedMessage` - Serializable message format for API
  - `Tool`, `ToolResult`, `ResearchItem` - Tool calling types
  - `Attachment` - File/image attachments
- Provider types in `src/providers/types.ts`
- Tool types in `src/providers/tools/types.ts`

### Message Block System
Messages use a block-based structure:
- `content` - Text content
- `attachments` - Images/files
- `research` - Tool calls and thinking process
- `error` - Error messages

### API Integration
- Chat endpoint: `POST /api/chat` (streaming SSE)
- Accepts `ChatRequest` with conversation history, conversationId, role
- Returns SSE stream with events: content, thinking, tool_call_start, tool_call_progress, tool_call_result, error
- Supports up to 200 tool calling iterations per request

## Configuration & Environment

Environment variables in `.env.local`:
- `ANTHROPIC_API_KEY` - Anthropic API key (required)
- `SERP_API_KEY` - Search API key (optional, enables search tool)
- Additional provider keys: OpenAI, OpenRouter, Gemini, Jina (if used)

## Testing

- Vitest with jsdom environment
- Test files: `*.test.tsx` next to source files
- Testing Library for React components

## Styling

- Tailwind CSS v4 with `@tailwindcss/vite` plugin
- UI components in `components/ui/` (Radix UI primitives)
- Utility functions in `lib/utils.ts`
- NES.css for retro styling elements
- Framer Motion for animations

## Code Style

- TypeScript strict mode
- 2-space indentation
- Single quotes, no semicolons
- PascalCase for components, camelCase for functions
- Hooks use `useX` naming
- Stores use `*Store` suffix
- ESLint config in `eslint.config.mjs`

## Important Implementation Details

### Tool Calling Flow
1. User sends message → API endpoint receives `ChatRequest`
2. `runChat()` streams from Anthropic with tool specs
3. When Claude requests tools, emit `tool_call_start` events
4. `executeTools()` runs tools with progress callbacks
5. `continueChat()` sends tool results back to Claude
6. Repeat until Claude stops or max iterations reached

### Conversation Persistence
- Conversations stored in IndexedDB (via `idb` package)
- Each conversation has UUID, title, messages, timestamps
- Messages have tree structure (prevSibling, nextSibling, latestChild) for branching

### Streaming Architecture
- Uses ReadableStream with SSE format
- `createEventSender()` utility for sending typed events
- `ResearchTracker` accumulates tool calls for UI display
- Events are JSON-encoded with `data:` prefix

## Common Patterns

### Adding a New Tool
1. Create tool definition in `src/providers/tools/`
2. Export `ToolDefinition` with `spec` (ChatTool) and `handler`
3. Register in `src/providers/tools/index.ts` toolMap
4. Add to allowed tools in API route if needed

### Adding a New Route
1. Create file in `src/app/` following naming convention
2. Use `createFileRoute()` from `@tanstack/react-router`
3. Export `Route` with component or server handlers

### Working with Messages
- Always use `SerializedMessage` for API/storage
- Convert to `Message` (with id, timestamps, tree structure) in UI
- Use block system for structured content

## When asked to create a plan or explain something, deliver the COMPLETE plan or explanation FIRST. Do NOT start editing files or writing code until the plan is explicitly approved by the user. If the user says 'explain first, then act', strictly follow that order.

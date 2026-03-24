# App Shell SSR Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move initial `/app` models, prompts, and conversation-list data to the `/app` route loader and hydrate the client store from that loader data.

**Architecture:** Fetch all three datasets in the parent `/app` loader, expose them through a tiny route-scoped context, and let the three current mount-fetching components hydrate the client store from loader data instead of firing first-load client requests.

**Tech Stack:** TanStack Start route loaders, React context, Zustand

---

### Task 1: Add `/app` Loader Data Contract

**Files:**

- Create: `src/features/sidebar/app-shell-route-data.tsx`
- Modify: `src/routes/app/route.tsx`

- [ ] Step 1: Define a small shared type/context for `/app` loader data.
- [ ] Step 2: Add a route loader that fetches models, prompts, and the first conversation page.
- [ ] Step 3: Wrap the `/app` subtree in the provider so child components can read loader data.

### Task 2: Add Store Hydration Actions

**Files:**

- Modify: `src/features/sidebar/useChatSessionStore.ts`

- [ ] Step 1: Add a hydrate action for the initial conversation page.
- [ ] Step 2: Add hydrate actions for available roles and prompts.
- [ ] Step 3: Reuse the same hydrate actions from existing async load actions to avoid duplicated selection logic.

### Task 3: Switch Initial Consumers to Loader Data

**Files:**

- Modify: `src/features/sidebar/components/ConversationList.tsx`
- Modify: `src/features/chat/composer/ModelSelector.tsx`
- Modify: `src/features/chat/composer/PromptSelector.tsx`

- [ ] Step 1: Read loader data from the shared `/app` route context.
- [ ] Step 2: Render from loader data when the store is still empty.
- [ ] Step 3: Hydrate the store from loader data instead of mount-fetching on first render.

### Task 4: Verify

**Files:**

- Verify only

- [ ] Step 1: Run `pnpm type-check`.
- [ ] Step 2: Run `pnpm build`.
- [ ] Step 3: Confirm the initial `/app` shell data is provided by the route loader path rather than those client-side first-load fetches.

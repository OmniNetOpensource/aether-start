# App Non-Critical Lazy Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `ShareDialog` and `SettingsModal` behind interaction-driven lazy imports so `/app` no longer eagerly loads clearly non-critical UI.

**Architecture:** Keep route/auth/sidebar/chat behavior eager. Add lazy boundaries at the import sites in `ShareButton` and `ProfileMenu`, and use small Suspense fallbacks plus optional preload on hover/focus so the first interaction stays smooth.

**Tech Stack:** React 19, TanStack Start, Vite, Suspense, dynamic `import()`

---

### Task 1: Lazy Load Share Dialog

**Files:**

- Modify: `src/features/share/components/ShareButton.tsx`

- [ ] Step 1: Replace the static `ShareDialog` import with `lazy(() => import(...))`.
- [ ] Step 2: Add a small local preload helper so hover/focus can warm the chunk before click.
- [ ] Step 3: Wrap the lazy dialog in `Suspense` with a minimal fallback that does not shift layout.
- [ ] Step 4: Preserve existing `currentPath` and busy-state behavior.

### Task 2: Lazy Load Settings Modal

**Files:**

- Modify: `src/features/settings/components/ProfileMenu.tsx`

- [ ] Step 1: Replace the static `SettingsModal` import with `lazy(() => import(...))`.
- [ ] Step 2: Add a local preload helper on likely-intent interactions.
- [ ] Step 3: Wrap the lazy modal in `Suspense` with a lightweight fallback.
- [ ] Step 4: Preserve theme toggle, dropdown open state, and settings open behavior.

### Task 3: Verify Bundle Boundary

**Files:**

- Verify only

- [ ] Step 1: Run `pnpm build`.
- [ ] Step 2: Confirm the `/app` route shell no longer directly imports share/settings-heavy chunks in the build manifest.
- [ ] Step 3: Record any remaining eager imports that still look suspicious.

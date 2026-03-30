# Markdown Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/benchmark/markdown` page that simulates streaming markdown and compares whole-render and split-render strategies with live timing stats.

**Architecture:** Add one standalone TanStack file route for the benchmark page, extract the existing paragraph splitter into a shared utility, and build two benchmark-only markdown renderers that differ only in render shape. The page owns the deterministic stream loop, timing collection, and built-in sample catalog so the comparison stays isolated from the rest of the app.

**Tech Stack:** TanStack Start file routes, React 19, TypeScript, Streamdown, existing design-system styles

---

### Task 1: Extract shared paragraph splitting utility

**Files:**

- Create: `src/shared/design-system/split-markdown-paragraphs.ts`
- Modify: `src/shared/design-system/MarkdownImpl.tsx`

- [ ] **Step 1: Create the shared splitter utility**

Move the existing fenced-code-aware splitting logic into `split-markdown-paragraphs.ts` and export `splitMarkdownParagraphs(text: string): string[]`.

- [ ] **Step 2: Update production markdown to use the shared utility**

Replace the inline helper in `MarkdownImpl.tsx` with an import from the new utility file.

- [ ] **Step 3: Keep behavior identical**

Do not change the splitting rules while extracting. The benchmark should compare existing behavior, not a new algorithm.

### Task 2: Build the benchmark route

**Files:**

- Create: `src/routes/benchmark/markdown.tsx`

- [ ] **Step 1: Define benchmark samples and defaults**

Add built-in markdown samples that cover common prose and code-heavy content. Choose sensible defaults for chunk size and interval so the page starts in a useful state.

- [ ] **Step 2: Implement the deterministic stream loop**

Keep source content, streamed content, running state, chunk size, and interval in route-local state. Append content on a fixed interval until the sample is exhausted.

- [ ] **Step 3: Implement timing collection**

Track append start times keyed by content length and collect commit durations for each strategy. Also collect split-function durations for the split strategy.

- [ ] **Step 4: Build the two renderer columns**

Render one column with a single `Streamdown` and one column with paragraph-split `Streamdown` blocks. Keep plugin config identical between both sides.

- [ ] **Step 5: Build the control surface and stats UI**

Add start, pause, reset, sample selection, chunk size, and interval controls. Display latest, average, p95, max, sample count, current length, and paragraph count where relevant.

### Task 3: Verify wiring and quality

**Files:**

- Verify: `src/routes/benchmark/markdown.tsx`
- Verify: `src/shared/design-system/MarkdownImpl.tsx`
- Verify: `src/shared/design-system/split-markdown-paragraphs.ts`

- [ ] **Step 1: Run type-check**

Run: `pnpm type-check`

Expected: success with no TypeScript errors

- [ ] **Step 2: Run build**

Run: `pnpm build`

Expected: production build succeeds and route generation includes `/benchmark/markdown`

- [ ] **Step 3: Review the diff for accidental production behavior changes**

Confirm the only production markdown change is the utility extraction, and the benchmark route remains isolated from the app shell.

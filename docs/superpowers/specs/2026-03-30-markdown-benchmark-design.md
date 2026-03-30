# Markdown Benchmark Design

**Goal**

Add a public benchmark page at `/benchmark/markdown` that visually compares two markdown rendering strategies during simulated streaming updates:

- render the full markdown string in one `Streamdown`
- split markdown into paragraphs and render one `Streamdown` per paragraph

The page should make the difference visible and show live timing stats so we can judge whether paragraph splitting is actually faster in practice.

**Scope**

This change only covers a benchmark page and the benchmark-specific helpers it needs:

- add a route for `/benchmark/markdown`
- simulate streaming markdown growth on the client
- render the same growing content through both strategies
- show live timing stats for both strategies
- show split-only calculation cost for the paragraph strategy
- keep the comparison self-contained and independent from the chat app shell

This change does not alter the production chat UI, replace the existing `MarkdownImpl`, or add a test framework.

**Problem**

The current markdown implementation in `src/shared/design-system/MarkdownImpl.tsx` already splits markdown by paragraph while preserving fenced code blocks. That optimization is plausible, but right now there is no direct way to compare it against the simpler "single markdown renderer for the whole string" approach under streaming updates.

Without a focused benchmark page, any conclusion about performance is guesswork because the normal chat screen mixes in unrelated costs:

- conversation store updates
- message list rendering
- scrolling behavior
- app shell layout
- unrelated components rerendering

So the missing piece is an isolated page where both strategies receive the same stream and are measured with the same rules.

**Design**

The benchmark will live on a standalone route, `src/routes/benchmark/markdown.tsx`, so it avoids auth gating and avoids the `/app` shell. The page will own a single simulated stream source and pass the same content to two benchmark renderers:

- `WholeMarkdownBenchmark`: one `Streamdown` for the full content
- `SplitMarkdownBenchmark`: split content into markdown paragraphs, then render one `Streamdown` per paragraph

The page layout will have three areas:

- a control bar for start, pause, reset, sample choice, tick interval, and chunk size
- a two-column comparison area with one renderer per strategy
- a stats area embedded into each column so the visual result and the measurements stay together

The stream simulation will append a fixed number of characters on each interval tick until the chosen sample is exhausted. This is intentionally deterministic. The benchmark is not trying to emulate provider timing jitter; it is trying to hold the input schedule constant so the rendering strategies are easier to compare.

**Measurement Model**

Each append will record a start timestamp immediately before the state update. A renderer-specific probe component will run after commit in a layout effect, read the shared start timestamp for the current content length, and record the elapsed time. This measures "state update to committed render on screen path" closely enough for an interactive browser benchmark without dragging unrelated app logic into the result.

The page will keep per-strategy measurements in memory and display:

- latest commit time
- average commit time
- p95 commit time
- max commit time
- sample count
- current content length

The split strategy will also measure the pure paragraph-splitting function cost on each render so we can separate "render got cheaper" from "split got more expensive".

**Rendering Isolation**

The benchmark components should share the same `Streamdown` plugin configuration as the production markdown renderer so the comparison stays relevant. The difference between the two columns should be narrowly scoped to the rendering shape:

- one `Streamdown` with the full string
- many `Streamdown` blocks built from `splitMarkdownParagraphs`

The benchmark components should not bring over unrelated production behavior such as resize observer content-visibility tuning. That logic is useful in production but would muddy the comparison because the benchmark question is specifically about whole-render versus split-render behavior during streaming.

**Sample Content**

The benchmark page will include a small built-in sample catalog. At minimum:

- a "Common" sample with headings, paragraphs, lists, quotes, and inline code
- a "Code Heavy" sample with multiple fenced code blocks and dense newlines

The page will repeat and expand these samples enough that the stream runs long enough to expose scaling behavior rather than finishing in a second or two.

**Why This Shape**

Putting the benchmark on `/benchmark/markdown` keeps it easy to open directly, easy to profile in DevTools, and free from authenticated app noise.

Using a single shared stream source matters because two independently ticking streams would make the comparison dishonest. Using separate benchmark-specific renderer components matters because reusing the production markdown component for both sides would erase the distinction we are trying to observe.

Measuring both commit time and split cost matters because the optimization claim is not "splitting is free"; it is "splitting plus smaller rerenders may beat whole rerenders." The page should make that tradeoff visible instead of hiding it behind one aggregate number.

**Files**

- Create `src/routes/benchmark/markdown.tsx` for the benchmark page and route
- Create `src/shared/design-system/split-markdown-paragraphs.ts` to move the existing paragraph-splitting logic into a reusable utility
- Modify `src/shared/design-system/MarkdownImpl.tsx` to use the shared split utility instead of keeping a private copy

**Risks**

- Dev mode adds React development overhead, so absolute numbers will be noisy. The page should be treated as a comparative benchmark, not a lab-grade stopwatch.
- Measuring with browser timers can still vary with machine load and background tab throttling. Trends matter more than one exact millisecond value.
- If the stream chunk size is too small, timer noise dominates; if it is too large, the interaction stops resembling streaming. The page needs sensible defaults.
- Repeated sample content can bias the benchmark toward a specific markdown shape. Including both common prose and code-heavy samples reduces that risk.

**Verification**

- open `/benchmark/markdown` and confirm the page renders without auth redirect
- start the stream and confirm both columns grow from the same content source
- confirm the whole-render column updates as one block and the split-render column grows by paragraphs
- confirm commit stats update live for both columns
- confirm the split column also reports split-function cost
- switch samples, reset, and rerun to confirm the stream restarts cleanly
- run `pnpm type-check`
- run `pnpm build`

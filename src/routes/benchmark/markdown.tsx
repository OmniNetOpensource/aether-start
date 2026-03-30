import { startTransition, type ReactNode, useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { createCodePlugin } from '@streamdown/code';
import { cjk } from '@streamdown/cjk';
import { createMathPlugin } from '@streamdown/math';
import { Streamdown, defaultRehypePlugins, type PluginConfig } from 'streamdown';
import { Button } from '@/shared/design-system/button';
import { Input } from '@/shared/design-system/input';
import { splitMarkdownParagraphs } from '@/shared/design-system/split-markdown-paragraphs';
import 'streamdown/styles.css';
import 'katex/dist/katex.min.css';

export const Route = createFileRoute('/benchmark/markdown')({
  component: MarkdownBenchmarkPage,
});

type BenchmarkSample = {
  id: string;
  label: string;
  description: string;
  content: string;
};

type TimingStats = {
  latestMs: number | null;
  averageMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  count: number;
  history: number[];
  samples: number[];
};

type SplitCommitPayload = {
  contentLength: number;
  paragraphCount: number;
  renderedAt: number;
  splitDurationMs: number;
};

const plugins: PluginConfig = {
  cjk,
  code: createCodePlugin({
    themes: ['github-light', 'github-dark'],
  }),
  math: createMathPlugin({ singleDollarTextMath: true }),
};

const rehypePlugins = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden];
const maxHistoryBars = 24;
const defaultChunkSize = 48;
const defaultIntervalMs = 32;

const benchmarkSamples: BenchmarkSample[] = [
  {
    id: 'common',
    label: 'Common',
    description: '普通段落、列表、引用、少量代码',
    content: Array.from({ length: 18 }, (_, index) => createCommonSection(index + 1)).join('\n\n'),
  },
  {
    id: 'code-heavy',
    label: 'Code Heavy',
    description: '大量 fenced code block 和密集换行',
    content: Array.from({ length: 12 }, (_, index) => createCodeHeavySection(index + 1)).join(
      '\n\n',
    ),
  },
];

function createCommonSection(index: number) {
  return [
    `## Common Section ${index}`,
    '',
    `这是第 ${index} 段说明文字。AI 流式输出时经常一小段一小段地追加，段落之间夹着空行。`,
    '',
    '非常常见的，最普通的用法。',
    '',
    '- 一个普通列表项',
    '- 一个带 `inline code` 的列表项',
    '- 一个比较长的列表项，用来制造更真实的换行和布局压力。',
    '',
    '> 观察一个优化值不值得，不能只看感觉，要把输入节奏和测量口径固定住。',
    '',
    '```tsx',
    'interface Props {',
    '  content: string;',
    '}',
    '',
    'export function HyperMarkdown({ content }: Props) {',
    '  return <MarkdownRender markdown={content} />;',
    '}',
    '```',
    '',
    `这一段结尾会刻意再写长一点。因为真正的聊天内容不会只是一两句，它会混着解释、代码、列表和总结一起出现。`,
  ].join('\n');
}

function createCodeHeavySection(index: number) {
  return [
    `## Code Heavy Section ${index}`,
    '',
    `这里主要测试 fenced code block 在不断增长时的表现。第 ${index} 组会包含多个代码块和说明。`,
    '',
    '```ts',
    'function splitContent(content: string) {',
    "  const lines = content.split('\\n');",
    '  const paragraphs: string[] = [];',
    '  let current: string[] = [];',
    '  let inCodeBlock = false;',
    '',
    '  for (const line of lines) {',
    "    if (line.trim().startsWith('```')) {",
    '      inCodeBlock = !inCodeBlock;',
    '      current.push(line);',
    '      continue;',
    '    }',
    '',
    '    if (inCodeBlock) {',
    '      current.push(line);',
    '      continue;',
    '    }',
    '',
    '    if (current.length > 0) {',
    "      paragraphs.push(current.join('\\n'));",
    '    }',
    '',
    '    current = [];',
    '    paragraphs.push(line);',
    '  }',
    '',
    '  return paragraphs;',
    '}',
    '```',
    '',
    '代码块内部的换行不应该被拆开，否则一个 fenced block 会被打断，Markdown 语义会直接错掉。',
    '',
    '```tsx',
    'export function Demo({ content }: { content: string }) {',
    '  return <MarkdownRender markdown={content} />;',
    '}',
    '```',
    '',
    '如果 split 成本太高，优化可能反而得不偿失。这就是这个 benchmark 页要验证的事。',
  ].join('\n');
}

function createEmptyTimingStats(): TimingStats {
  return {
    latestMs: null,
    averageMs: null,
    p95Ms: null,
    maxMs: null,
    count: 0,
    history: [],
    samples: [],
  };
}

function appendTiming(stats: TimingStats, value: number): TimingStats {
  const samples = [...stats.samples, value];
  const nextHistory = [...stats.history, value];
  const recentHistory =
    nextHistory.length > maxHistoryBars
      ? nextHistory.slice(nextHistory.length - maxHistoryBars)
      : nextHistory;
  const sorted = [...samples].sort((left, right) => left - right);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const total = samples.reduce((sum, current) => sum + current, 0);

  return {
    latestMs: value,
    averageMs: total / samples.length,
    p95Ms: sorted[p95Index] ?? value,
    maxMs: Math.max(stats.maxMs ?? 0, value),
    count: samples.length,
    history: recentHistory,
    samples,
  };
}

function formatMs(value: number | null) {
  if (value === null) {
    return '--';
  }

  return `${value.toFixed(2)} ms`;
}

function selectSample(sampleId: string) {
  return benchmarkSamples.find((sample) => sample.id === sampleId) ?? benchmarkSamples[0];
}

function MarkdownBenchmarkPage() {
  const [sampleId, setSampleId] = useState(benchmarkSamples[0]?.id ?? '');
  const [chunkSize, setChunkSize] = useState(defaultChunkSize);
  const [intervalMs, setIntervalMs] = useState(defaultIntervalMs);
  const [isRunning, setIsRunning] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [wholeStats, setWholeStats] = useState(createEmptyTimingStats);
  const [splitRenderStats, setSplitRenderStats] = useState(createEmptyTimingStats);
  const [splitComputeStats, setSplitComputeStats] = useState(createEmptyTimingStats);
  const [splitParagraphCount, setSplitParagraphCount] = useState(0);
  const wholePendingRef = useRef(new Map<number, number>());
  const splitPendingRef = useRef(new Map<number, number>());

  const selectedSample = selectSample(sampleId);
  const isComplete = streamedContent.length >= selectedSample.content.length;
  const progress =
    selectedSample.content.length === 0
      ? 0
      : Math.round((streamedContent.length / selectedSample.content.length) * 100);

  useEffect(() => {
    if (!isRunning || isComplete) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextLength = Math.min(
        streamedContent.length + chunkSize,
        selectedSample.content.length,
      );
      const nextContent = selectedSample.content.slice(0, nextLength);
      const startedAt = performance.now();

      wholePendingRef.current.set(nextLength, startedAt);
      splitPendingRef.current.set(nextLength, startedAt);
      setStreamedContent(nextContent);
    }, intervalMs);

    return () => window.clearTimeout(timeoutId);
  }, [
    chunkSize,
    intervalMs,
    isComplete,
    isRunning,
    selectedSample.content,
    streamedContent.length,
  ]);

  function resetBenchmark(nextSampleId = sampleId) {
    wholePendingRef.current.clear();
    splitPendingRef.current.clear();
    setIsRunning(false);
    setStreamedContent('');
    setWholeStats(createEmptyTimingStats());
    setSplitRenderStats(createEmptyTimingStats());
    setSplitComputeStats(createEmptyTimingStats());
    setSplitParagraphCount(0);
    setSampleId(nextSampleId);
  }

  function handleToggleRun() {
    if (isComplete) {
      wholePendingRef.current.clear();
      splitPendingRef.current.clear();
      setStreamedContent('');
      setWholeStats(createEmptyTimingStats());
      setSplitRenderStats(createEmptyTimingStats());
      setSplitComputeStats(createEmptyTimingStats());
      setSplitParagraphCount(0);
    }

    setIsRunning((current) => !current || isComplete);
  }

  function handleWholeCommit(contentLength: number, renderedAt: number) {
    const startedAt = wholePendingRef.current.get(contentLength);

    if (startedAt === undefined) {
      return;
    }

    wholePendingRef.current.delete(contentLength);
    startTransition(() => {
      setWholeStats((current) => appendTiming(current, renderedAt - startedAt));
    });
  }

  function handleSplitCommit({
    contentLength,
    paragraphCount,
    renderedAt,
    splitDurationMs,
  }: SplitCommitPayload) {
    const startedAt = splitPendingRef.current.get(contentLength);

    if (startedAt === undefined) {
      return;
    }

    splitPendingRef.current.delete(contentLength);
    startTransition(() => {
      setSplitParagraphCount(paragraphCount);
      setSplitRenderStats((current) => appendTiming(current, renderedAt - startedAt));
      setSplitComputeStats((current) => appendTiming(current, splitDurationMs));
    });
  }

  return (
    <div className='h-screen overflow-y-auto bg-(--surface-primary) text-(--text-primary)'>
      <div className='mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8'>
        <section className='rounded-3xl border border-(--border-primary) bg-(--surface-secondary) p-5 shadow-[0_24px_80px_rgba(0,0,0,0.08)]'>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-2'>
              <p className='text-xs tracking-[0.24em] text-(--text-secondary) uppercase'>
                Markdown Benchmark
              </p>
              <h1 className='text-3xl font-semibold sm:text-4xl'>
                Whole render vs split paragraphs
              </h1>
              <p className='max-w-3xl text-sm leading-6 text-(--text-secondary) sm:text-base'>
                同一份流式 markdown 同时喂给两种渲染策略。上面看交互，下面看统计。
                这个页面关心的是趋势，不是假装自己是实验室级 microbenchmark。
              </p>
            </div>

            <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,0.8fr))]'>
              <label className='flex flex-col gap-2 text-sm'>
                <span className='text-(--text-secondary)'>Sample</span>
                <select
                  className='h-9 rounded-md border border-(--border-primary) bg-(--surface-primary) px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-(--interactive-primary)'
                  onChange={(event) => resetBenchmark(event.target.value)}
                  value={sampleId}
                >
                  {benchmarkSamples.map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sample.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className='flex flex-col gap-2 text-sm'>
                <span className='text-(--text-secondary)'>Chunk Size</span>
                <Input
                  min={8}
                  onChange={(event) => setChunkSize(Number(event.target.value) || defaultChunkSize)}
                  type='number'
                  value={chunkSize}
                />
              </label>

              <label className='flex flex-col gap-2 text-sm'>
                <span className='text-(--text-secondary)'>Interval (ms)</span>
                <Input
                  min={8}
                  onChange={(event) =>
                    setIntervalMs(Number(event.target.value) || defaultIntervalMs)
                  }
                  type='number'
                  value={intervalMs}
                />
              </label>

              <div className='flex flex-col gap-2 text-sm'>
                <span className='text-(--text-secondary)'>Controls</span>
                <div className='flex gap-2'>
                  <Button className='flex-1' onClick={handleToggleRun} type='button'>
                    {isRunning && !isComplete ? 'Pause' : 'Start'}
                  </Button>
                  <Button
                    className='flex-1'
                    onClick={() => resetBenchmark()}
                    type='button'
                    variant='outline'
                  >
                    Reset
                  </Button>
                </div>
              </div>

              <div className='flex flex-col justify-between rounded-2xl border border-(--border-primary) bg-(--surface-primary) px-4 py-3'>
                <div className='text-xs tracking-[0.16em] text-(--text-secondary) uppercase'>
                  Progress
                </div>
                <div className='mt-2 text-2xl font-semibold'>{progress}%</div>
                <div className='mt-2 text-xs text-(--text-secondary)'>
                  {streamedContent.length} / {selectedSample.content.length} chars
                </div>
              </div>
            </div>

            <div className='rounded-2xl border border-dashed border-(--border-primary) px-4 py-3 text-sm text-(--text-secondary)'>
              <span className='font-medium text-(--text-primary)'>{selectedSample.label}</span>
              <span className='mx-2 text-(--text-tertiary)'>/</span>
              {selectedSample.description}
            </div>
          </div>
        </section>

        <div className='grid gap-6 xl:grid-cols-2'>
          <BenchmarkCard
            contentLength={streamedContent.length}
            history={wholeStats.history}
            latestLabel='Latest commit'
            stats={wholeStats}
            title='Whole markdown render'
          >
            <WholeMarkdownBenchmark content={streamedContent} onCommit={handleWholeCommit} />
          </BenchmarkCard>

          <BenchmarkCard
            contentLength={streamedContent.length}
            extraStatLabel='Paragraphs'
            extraStatValue={String(splitParagraphCount)}
            history={splitRenderStats.history}
            latestLabel='Latest commit'
            secondaryLabel='Latest split'
            secondaryStats={splitComputeStats}
            stats={splitRenderStats}
            title='Split paragraphs render'
          >
            <SplitMarkdownBenchmark content={streamedContent} onCommit={handleSplitCommit} />
          </BenchmarkCard>
        </div>
      </div>
    </div>
  );
}

function WholeMarkdownBenchmark({
  content,
  onCommit,
}: {
  content: string;
  onCommit: (contentLength: number, renderedAt: number) => void;
}) {
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      onCommitRef.current(content.length, performance.now());
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [content]);

  return (
    <div className='min-h-full rounded-2xl border border-(--border-primary) bg-(--surface-primary) p-4'>
      {content.length === 0 ? (
        <EmptyState />
      ) : (
        <Streamdown rehypePlugins={rehypePlugins} plugins={plugins}>
          {content}
        </Streamdown>
      )}
    </div>
  );
}

function SplitMarkdownBenchmark({
  content,
  onCommit,
}: {
  content: string;
  onCommit: (payload: SplitCommitPayload) => void;
}) {
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const splitStartedAt = performance.now();
  const paragraphs = splitMarkdownParagraphs(content);
  const splitDurationMs = performance.now() - splitStartedAt;
  const paragraphCountRef = useRef(0);
  const splitDurationRef = useRef(0);

  paragraphCountRef.current = paragraphs.length;
  splitDurationRef.current = splitDurationMs;

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      onCommitRef.current({
        contentLength: content.length,
        paragraphCount: paragraphCountRef.current,
        renderedAt: performance.now(),
        splitDurationMs: splitDurationRef.current,
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [content]);

  return (
    <div className='flex min-h-full flex-col gap-3 rounded-2xl border border-(--border-primary) bg-(--surface-primary) p-4'>
      {content.length === 0 ? (
        <EmptyState />
      ) : (
        paragraphs.map((paragraph, index) => (
          <div
            className='rounded-xl border border-dashed border-(--border-primary) p-3'
            key={index}
          >
            <Streamdown rehypePlugins={rehypePlugins} plugins={plugins}>
              {paragraph}
            </Streamdown>
          </div>
        ))
      )}
    </div>
  );
}

function BenchmarkCard({
  children,
  contentLength,
  extraStatLabel,
  extraStatValue,
  history,
  latestLabel,
  secondaryLabel,
  secondaryStats,
  stats,
  title,
}: {
  children: ReactNode;
  contentLength: number;
  extraStatLabel?: string;
  extraStatValue?: string;
  history: number[];
  latestLabel: string;
  secondaryLabel?: string;
  secondaryStats?: TimingStats;
  stats: TimingStats;
  title: string;
}) {
  return (
    <section className='flex min-h-[42rem] flex-col overflow-hidden rounded-3xl border border-(--border-primary) bg-(--surface-secondary)'>
      <div className='border-b border-(--border-primary) px-5 py-4'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <h2 className='text-xl font-semibold'>{title}</h2>
            <p className='mt-1 text-sm text-(--text-secondary)'>
              Current content length: {contentLength} chars
            </p>
          </div>
          <div className='rounded-full border border-(--border-primary) px-3 py-1 text-xs text-(--text-secondary)'>
            {stats.count} samples
          </div>
        </div>

        <div className='mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          <StatTile label={latestLabel} value={formatMs(stats.latestMs)} />
          <StatTile label='Average' value={formatMs(stats.averageMs)} />
          <StatTile label='P95' value={formatMs(stats.p95Ms)} />
          <StatTile label='Max' value={formatMs(stats.maxMs)} />
          {secondaryLabel && secondaryStats ? (
            <StatTile label={secondaryLabel} value={formatMs(secondaryStats.latestMs)} />
          ) : null}
          {secondaryStats ? (
            <StatTile label='Split avg' value={formatMs(secondaryStats.averageMs)} />
          ) : null}
          {secondaryStats ? (
            <StatTile label='Split p95' value={formatMs(secondaryStats.p95Ms)} />
          ) : null}
          {extraStatLabel && extraStatValue ? (
            <StatTile label={extraStatLabel} value={extraStatValue} />
          ) : null}
        </div>

        <HistoryBars values={history} />
      </div>

      <div className='min-h-0 flex-1 overflow-auto p-5'>{children}</div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-2xl border border-(--border-primary) bg-(--surface-primary) px-4 py-3'>
      <div className='text-xs tracking-[0.16em] text-(--text-secondary) uppercase'>{label}</div>
      <div className='mt-2 text-lg font-semibold'>{value}</div>
    </div>
  );
}

function HistoryBars({ values }: { values: number[] }) {
  const maxValue = values.length === 0 ? 1 : Math.max(...values, 1);

  return (
    <div className='mt-4'>
      <div className='mb-2 text-xs tracking-[0.16em] text-(--text-secondary) uppercase'>
        Recent commit history
      </div>
      <div className='flex h-16 items-end gap-1 rounded-2xl border border-(--border-primary) bg-(--surface-primary) px-3 py-3'>
        {values.length === 0 ? (
          <div className='text-xs text-(--text-secondary)'>Run the stream to collect data.</div>
        ) : (
          values.map((value, index) => (
            <div
              className='flex-1 rounded-sm bg-(--content-accent)'
              key={`${index}-${value}`}
              style={{ height: `${Math.max((value / maxValue) * 100, 10)}%` }}
              title={formatMs(value)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className='flex min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-(--border-primary) bg-(--surface-primary) px-4 text-sm text-(--text-secondary)'>
      Press start to begin streaming markdown.
    </div>
  );
}

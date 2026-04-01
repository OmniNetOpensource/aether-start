import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  Streamdown,
  defaultRehypePlugins,
  type PluginConfig,
} from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { cjk } from '@streamdown/cjk';
import { createMathPlugin } from '@streamdown/math';
import MarkdownImpl from '@/shared/design-system/MarkdownImpl';
import 'streamdown/styles.css';
import 'katex/dist/katex.min.css';

export const Route = createFileRoute('/benchmark/markdown')({
  component: BenchmarkPage,
});

const plugins: PluginConfig = {
  cjk,
  code: createCodePlugin({ themes: ['github-light', 'github-dark'] }),
  math: createMathPlugin({ singleDollarTextMath: true }),
};

const CHUNK_SIZE = 12;
const CHUNK_INTERVAL_MS = 16;

const BASE_MARKDOWN = `# Markdown Rendering Benchmark

这是一段用于性能基准测试的长文本。我们将模拟 LLM 流式输出的场景，逐步追加 token，观察两种渲染方式在帧率和渲染耗时上的差异。

## 1. 基础文本段落

Artificial intelligence has transformed the way we interact with technology. From natural language processing to computer vision, the applications are vast and continuously evolving. Large language models, in particular, have demonstrated remarkable capabilities in understanding and generating human language.

The transformer architecture, introduced in the seminal paper "Attention Is All You Need," revolutionized sequence modeling. By replacing recurrence with self-attention mechanisms, transformers enabled parallelization during training and achieved state-of-the-art results across numerous benchmarks.

深度学习模型的训练通常需要大量的计算资源。GPU 加速使得矩阵运算的效率大幅提升，而分布式训练框架则让我们能够在多台机器上并行训练超大规模模型。

## 2. 数学公式

行内公式：能量质量关系 $E = mc^2$，以及高斯积分 $\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$。

块级公式用贝叶斯定理表示：

$$
P(A|B) = \\frac{P(B|A) \\cdot P(A)}{P(B)}
$$

梯度下降的更新规则：

$$
\\theta_{t+1} = \\theta_t - \\eta \\nabla_{\\theta} \\mathcal{L}(\\theta_t)
$$

## 3. 代码块

\`\`\`typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

async function streamChat(messages: ChatMessage[]): Promise<ReadableStream<string>> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  return response.body!.pipeThrough(new TextDecoderStream());
}
\`\`\`

\`\`\`python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

class TransformerBlock(nn.Module):
    def __init__(self, d_model: int, n_heads: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, n_heads, dropout=dropout, batch_first=True)
        self.ff = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_model),
            nn.Dropout(dropout),
        )
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)

    def forward(self, x: torch.Tensor, mask: torch.Tensor | None = None) -> torch.Tensor:
        residual = x
        x = self.norm1(x)
        x, _ = self.attn(x, x, x, attn_mask=mask)
        x = x + residual

        residual = x
        x = self.norm2(x)
        x = self.ff(x) + residual
        return x
\`\`\`

## 4. 表格

| 模型 | 参数量 | 训练数据 | MMLU | HumanEval |
|------|--------|----------|------|-----------|
| GPT-4 | ~1.8T | 13T tokens | 86.4% | 67.0% |
| Claude 3.5 Sonnet | Unknown | Unknown | 88.7% | 92.0% |
| Gemini Ultra | Unknown | Unknown | 83.7% | 74.4% |
| Llama 3.1 405B | 405B | 15T tokens | 88.6% | 89.0% |

## 5. 列表与嵌套

- **前端渲染优化技术**
  - Virtual DOM diffing 减少真实 DOM 操作
  - \`contentVisibility: auto\` 跳过屏幕外元素的渲染
  - \`contain-intrinsic-size\` 防止 layout shift
  - 使用 IntersectionObserver 实现懒加载
- **流式渲染的挑战**
  - 每个 token 都触发 re-render
  - Markdown 解析在中间状态可能产生不完整的 AST
  - 代码高亮和数学公式渲染是昂贵的操作
  - 长对话的 DOM 节点数持续增长

1. 第一步：拆分段落，每个段落独立渲染
2. 第二步：对已稳定的段落设置 \`contentVisibility: auto\`
3. 第三步：通过 ResizeObserver 预存 intrinsic size
4. 第四步：只有最后一个段落参与动画

## 6. 引用与强调

> "The best way to predict the future is to invent it." — Alan Kay
>
> 在软件工程中，性能优化的第一原则是 **测量**，而不是猜测。过早的优化是万恶之源。

**粗体文本**、*斜体文本*、~~删除线~~、\`行内代码\`。

## 7. 更多中文段落

在现代 Web 开发中，React 的渲染模型已经从最初的同步渲染演进到了并发模式。Fiber 架构让 React 能够将渲染工作拆分为可中断的小任务，从而在保持界面响应性的同时完成复杂的更新。

流式聊天界面是一个对渲染性能要求极高的场景。每一个从服务端传来的 token 都会触发一次状态更新，进而导致整个消息组件重新渲染。如果消息很长，包含代码块、数学公式和表格，那么单次渲染的开销可能达到几十毫秒，远超 16ms 的帧预算。

通过段落级别的拆分，我们可以将渲染范围限制在最后一个（正在更新的）段落。已经完成流式输出的段落不会因为新 token 的到来而重新解析和渲染。再配合 \`contentVisibility: auto\`，滚动到屏幕外的段落甚至不会参与布局计算。

## 8. 链接和图片引用

了解更多可以访问 [React 文档](https://react.dev) 或 [MDN Web Docs](https://developer.mozilla.org)。

## 9. 分割线之后的附加内容

---

这是分割线下方的额外文字，用于增加整体文档长度，确保在流式输出过程中有足够的内容来展现两种渲染方式之间的性能差异。当文档越长，段落越多时，\`contentVisibility\` 的优势越明显，因为更多已完成渲染的段落可以被跳过。
`;

function repeatMarkdown(multiplier: number) {
  if (multiplier <= 1) return BASE_MARKDOWN;
  return Array.from({ length: multiplier }, () => BASE_MARKDOWN).join('\n\n---\n\n');
}

type FrameSample = { ts: number; dur: number };

function useStreamSimulation(onComplete?: () => void) {
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const offsetRef = useRef(0);
  const sourceRef = useRef('');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const start = (source: string) => {
    sourceRef.current = source;
    offsetRef.current = 0;
    setText('');
    setPaused(false);
    setRunning(true);
  };

  const reset = () => {
    offsetRef.current = 0;
    setText('');
    setPaused(false);
    setRunning(false);
  };

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);

  useEffect(() => {
    if (!running || paused) return;

    const id = setInterval(() => {
      const src = sourceRef.current;
      const next = offsetRef.current + CHUNK_SIZE;
      if (next >= src.length) {
        setText(src);
        setRunning(false);
        onCompleteRef.current?.();
        return;
      }
      offsetRef.current = next;
      setText(src.slice(0, next));
    }, CHUNK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [running, paused]);

  return { text, running, paused, start, reset, pause, resume };
}

function useFpsMeter(active: boolean) {
  const samplesRef = useRef<FrameSample[]>([]);
  const [fps, setFps] = useState(0);
  const [longFrames, setLongFrames] = useState(0);
  const [avgFrameMs, setAvgFrameMs] = useState(0);

  useEffect(() => {
    if (!active) return;

    samplesRef.current = [];
    let lastTime = performance.now();
    let handle: number;

    const tick = () => {
      const now = performance.now();
      const dur = now - lastTime;
      lastTime = now;
      samplesRef.current.push({ ts: now, dur });

      const oneSecAgo = now - 1000;
      const recent = samplesRef.current.filter((s) => s.ts > oneSecAgo);
      setFps(recent.length);
      setLongFrames(samplesRef.current.filter((s) => s.dur > 20).length);
      const avg = recent.reduce((sum, s) => sum + s.dur, 0) / (recent.length || 1);
      setAvgFrameMs(Math.round(avg * 100) / 100);

      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [active]);

  const getSummary = () => {
    const all = samplesRef.current;
    if (all.length === 0) return null;
    const durations = all.map((s) => s.dur).sort((a, b) => a - b);
    return {
      totalFrames: all.length,
      longFrames: all.filter((s) => s.dur > 20).length,
      avgMs: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 100) / 100,
      p50Ms: Math.round(durations[Math.floor(durations.length * 0.5)] * 100) / 100,
      p95Ms: Math.round(durations[Math.floor(durations.length * 0.95)] * 100) / 100,
      p99Ms: Math.round(durations[Math.floor(durations.length * 0.99)] * 100) / 100,
      maxMs: Math.round(durations[durations.length - 1] * 100) / 100,
    };
  };

  return { fps, longFrames, avgFrameMs, getSummary };
}

function MetricsBar({
  label,
  fps,
  longFrames,
  avgFrameMs,
}: {
  label: string;
  fps: number;
  longFrames: number;
  avgFrameMs: number;
}) {
  return (
    <div className='flex items-center gap-4 rounded-lg border px-4 py-2 text-sm font-mono'>
      <span className='font-semibold'>{label}</span>
      <span>
        FPS: <b className={fps < 30 ? 'text-red-500' : fps < 50 ? 'text-yellow-500' : 'text-green-600'}>{fps}</b>
      </span>
      <span>Avg: <b>{avgFrameMs}ms</b></span>
      <span>Long frames ({'>'}20ms): <b className={longFrames > 50 ? 'text-red-500' : ''}>{longFrames}</b></span>
    </div>
  );
}

type Summary = NonNullable<ReturnType<ReturnType<typeof useFpsMeter>['getSummary']>>;

function SummaryTable({ a, b }: { a: Summary | null; b: Summary | null }) {
  if (!a || !b) return null;

  const rows: { label: string; key: keyof Summary; unit: string }[] = [
    { label: 'Total Frames', key: 'totalFrames', unit: '' },
    { label: 'Long Frames (>20ms)', key: 'longFrames', unit: '' },
    { label: 'Avg Frame', key: 'avgMs', unit: 'ms' },
    { label: 'P50 Frame', key: 'p50Ms', unit: 'ms' },
    { label: 'P95 Frame', key: 'p95Ms', unit: 'ms' },
    { label: 'P99 Frame', key: 'p99Ms', unit: 'ms' },
    { label: 'Max Frame', key: 'maxMs', unit: 'ms' },
  ];

  return (
    <table className='w-full text-sm border-collapse'>
      <thead>
        <tr className='border-b'>
          <th className='text-left py-2 px-3'>Metric</th>
          <th className='text-right py-2 px-3'>Optimized (MarkdownImpl)</th>
          <th className='text-right py-2 px-3'>Baseline (Streamdown)</th>
          <th className='text-right py-2 px-3'>Diff</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, key, unit }) => {
          const va = a[key];
          const vb = b[key];
          const diff = key === 'totalFrames'
            ? `${va > vb ? '+' : ''}${va - vb}`
            : `${va < vb ? '-' : '+'}${Math.abs(Math.round((va - vb) * 100) / 100)}${unit}`;
          const better = key === 'totalFrames' ? va >= vb : va <= vb;
          return (
            <tr key={key} className='border-b'>
              <td className='py-2 px-3'>{label}</td>
              <td className={`text-right py-2 px-3 font-mono ${better ? 'text-green-600 font-semibold' : ''}`}>
                {va}{unit}
              </td>
              <td className={`text-right py-2 px-3 font-mono ${!better ? 'text-green-600 font-semibold' : ''}`}>
                {vb}{unit}
              </td>
              <td className={`text-right py-2 px-3 font-mono ${better ? 'text-green-600' : 'text-red-500'}`}>
                {diff}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BenchmarkPage() {
  const [summaryA, setSummaryA] = useState<Summary | null>(null);
  const [summaryB, setSummaryB] = useState<Summary | null>(null);
  const [mode, setMode] = useState<'idle' | 'running-a' | 'running-b' | 'done'>('idle');
  const [multiplier, setMultiplier] = useState(1);

  const markdownRef = useRef(BASE_MARKDOWN);
  const meterARef = useRef<ReturnType<typeof useFpsMeter>>(null!);
  const meterBRef = useRef<ReturnType<typeof useFpsMeter>>(null!);
  const streamBRef = useRef<ReturnType<typeof useStreamSimulation>>(null!);

  const streamA = useStreamSimulation(() => {
    setSummaryA(meterARef.current.getSummary());
    setMode('running-b');
    setTimeout(() => streamBRef.current.start(markdownRef.current), 500);
  });

  const streamB = useStreamSimulation(() => {
    setSummaryB(meterBRef.current.getSummary());
    setMode('done');
  });

  const meterA = useFpsMeter(streamA.running);
  const meterB = useFpsMeter(streamB.running);

  meterARef.current = meterA;
  meterBRef.current = meterB;
  streamBRef.current = streamB;

  const isRunning = mode === 'running-a' || mode === 'running-b';
  const streamPaused = mode === 'running-a' ? streamA.paused : streamB.paused;

  const togglePause = () => {
    if (mode === 'running-a') {
      if (streamA.paused) streamA.resume();
      else streamA.pause();
      return;
    }
    if (mode === 'running-b') {
      if (streamB.paused) streamB.resume();
      else streamB.pause();
    }
  };

  const runBenchmark = () => {
    markdownRef.current = repeatMarkdown(multiplier);
    setSummaryA(null);
    setSummaryB(null);
    setMode('running-a');
    streamA.reset();
    streamB.reset();
    setTimeout(() => streamA.start(markdownRef.current), 100);
  };

  const charCount = repeatMarkdown(multiplier).length;

  return (
    <div className='h-dvh overflow-y-auto bg-white p-6 dark:bg-neutral-950'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <div className='space-y-2'>
          <h1 className='text-2xl font-bold'>Markdown Streaming Benchmark</h1>
          <p className='text-sm text-neutral-500'>
            先运行 Optimized（MarkdownImpl），再运行 Baseline（单个 Streamdown），数据源为同一段字符串。
            Phase 2 开始时左侧已是完整内容、右侧从零流式输出，属串行对比的正常现象。
            每轮流式输出 {charCount.toLocaleString()} 字符，每 {CHUNK_INTERVAL_MS}ms 追加 {CHUNK_SIZE} 字符。
          </p>
        </div>

        <div className='flex items-center gap-4'>
          <button
            className='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
            disabled={isRunning}
            onClick={runBenchmark}
          >
            {mode === 'idle' ? 'Run Benchmark' : mode === 'done' ? 'Run Again' : 'Running…'}
          </button>

          <button
            className='rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:hover:bg-neutral-900'
            disabled={!isRunning}
            onClick={togglePause}
          >
            {isRunning ? (streamPaused ? 'Resume' : 'Pause') : 'Pause'}
          </button>

          <div className='flex items-center gap-2 rounded-lg border px-3 py-1.5'>
            <span className='text-sm text-neutral-500'>Text</span>
            <button
              className='flex size-6 items-center justify-center rounded text-lg font-bold hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800'
              disabled={isRunning || multiplier <= 1}
              onClick={() => setMultiplier((m) => Math.max(1, m / 2))}
            >
              −
            </button>
            <span className='min-w-10 text-center text-sm font-semibold'>{multiplier}x</span>
            <button
              className='flex size-6 items-center justify-center rounded text-lg font-bold hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800'
              disabled={isRunning || multiplier >= 32}
              onClick={() => setMultiplier((m) => Math.min(32, m * 2))}
            >
              +
            </button>
          </div>

          {mode !== 'idle' && (
            <span className='text-sm text-neutral-500'>
              {mode === 'running-a' && 'Phase 1/2: Optimized (MarkdownImpl)'}
              {mode === 'running-b' && 'Phase 2/2: Baseline (Streamdown)'}
              {mode === 'done' && 'Complete — see summary below'}
            </span>
          )}
        </div>

        {mode === 'done' && (
          <div className='rounded-lg border p-4 space-y-2'>
            <h2 className='text-lg font-semibold'>Summary</h2>
            <SummaryTable a={summaryA} b={summaryB} />
          </div>
        )}

        <div className='grid grid-cols-2 gap-6'>
          <div className='space-y-3'>
            <MetricsBar label='Optimized' fps={meterA.fps} longFrames={meterA.longFrames} avgFrameMs={meterA.avgFrameMs} />
            <div className='h-[600px] overflow-y-auto rounded-lg border p-4'>
              {streamA.text && <MarkdownImpl content={streamA.text} isAnimating={streamA.running} />}
            </div>
          </div>

          <div className='space-y-3'>
            <MetricsBar label='Baseline' fps={meterB.fps} longFrames={meterB.longFrames} avgFrameMs={meterB.avgFrameMs} />
            <div className='h-[600px] overflow-y-auto rounded-lg border p-4'>
              {streamB.text && (
                <Streamdown
                  plugins={plugins}
                  rehypePlugins={[defaultRehypePlugins.sanitize, defaultRehypePlugins.harden]}
                  isAnimating={streamB.running}
                >
                  {streamB.text}
                </Streamdown>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

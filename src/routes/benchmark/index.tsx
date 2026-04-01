import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/benchmark/')({
  component: BenchmarkIndex,
});

const benchmarks = [
  {
    to: '/benchmark/markdown',
    title: 'Markdown Streaming',
    description: '对比 MarkdownImpl（段落拆分 + contentVisibility）与原生 Streamdown 在流式输出场景下的帧率和渲染耗时。',
  },
];

function BenchmarkIndex() {
  return (
    <div className='min-h-screen overflow-auto bg-white p-8 dark:bg-neutral-950'>
      <div className='mx-auto max-w-2xl space-y-8'>
        <h1 className='text-3xl font-bold'>Benchmarks</h1>
        <div className='space-y-3'>
          {benchmarks.map((b) => (
            <Link
              key={b.to}
              to={b.to}
              className='block rounded-lg border p-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900'
            >
              <h2 className='text-lg font-semibold'>{b.title}</h2>
              <p className='mt-1 text-sm text-neutral-500'>{b.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from '@tanstack/react-router'
import { memo, forwardRef, useState } from 'react'

export const Route = createFileRoute('/render-tracker-demo')({
  component: RenderTrackerDemoPage,
})

const MemoBadge = memo(function MemoBadge({ value }: { value: number }) {
  return (
    <div className='rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300'>
      memo value {value}
    </div>
  )
})

const ForwardCounter = forwardRef<HTMLDivElement, { count: number }>(function ForwardCounter(
  { count },
  ref
) {
  return (
    <div
      ref={ref}
      className='rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sky-900 shadow-sm dark:text-sky-100'
    >
      forwardRef count {count}
    </div>
  )
})

function RenderTrackerDemoPage() {
  const [count, setCount] = useState(0)
  const [showPanel, setShowPanel] = useState(true)

  return (
    <main className='min-h-screen bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.18),_transparent_45%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-6 py-12 text-slate-900 dark:bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_42%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] dark:text-slate-100'>
      <div className='mx-auto flex max-w-5xl flex-col gap-8'>
        <section className='space-y-4'>
          <p className='text-sm uppercase tracking-[0.24em] text-sky-700/75 dark:text-sky-300/70'>
            Render Tracker Demo
          </p>
          <h1 className='max-w-2xl text-4xl font-semibold tracking-tight'>
            A small page for watching mount, update, and unmount commits.
          </h1>
          <p className='max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300'>
            Start the app with <code>VITE_ENABLE_RENDER_TRACKER=true</code> in development, then click the controls below. The page itself stays ordinary SSR TanStack Start UI; the tracker is only a dev-time add-on.
          </p>
        </section>

        <section className='flex flex-wrap gap-3'>
          <button
            type='button'
            onClick={() => setCount((value) => value + 1)}
            className='rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white'
          >
            Increment
          </button>
          <button
            type='button'
            onClick={() => setShowPanel((value) => !value)}
            className='rounded-full border border-slate-400/40 bg-white/70 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-white dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-900'
          >
            {showPanel ? 'Unmount block' : 'Mount block'}
          </button>
        </section>

        <section className='grid gap-4 md:grid-cols-[1.2fr_0.8fr]'>
          <div className='rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/70'>
            <h2 className='text-lg font-semibold'>Live state</h2>
            <div className='mt-4 grid gap-4 sm:grid-cols-2'>
              <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900'>
                <div className='text-xs uppercase tracking-[0.2em] text-slate-500'>count</div>
                <div className='mt-3 text-5xl font-semibold'>{count}</div>
              </div>
              <ForwardCounter count={count} />
            </div>
          </div>

          <div className='rounded-[28px] border border-slate-200/70 bg-white/85 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/72'>
            <h2 className='text-lg font-semibold'>Stable child</h2>
            <div className='mt-4 flex flex-wrap gap-3'>
              <MemoBadge value={count} />
              {showPanel ? <ToggleBlock count={count} /> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function ToggleBlock({ count }: { count: number }) {
  return (
    <section className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-950 dark:text-amber-100'>
      <div className='text-xs uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-300/80'>
        conditional branch
      </div>
      <div className='mt-3 text-sm'>Rendered only while the toggle stays on.</div>
      <ul className='mt-4 space-y-2 text-sm'>
        <li>commit #{count}</li>
        <li>{count % 2 === 0 ? 'even branch' : 'odd branch'}</li>
      </ul>
    </section>
  )
}

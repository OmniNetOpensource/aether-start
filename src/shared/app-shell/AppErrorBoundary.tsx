import { createErrorBoundary, createSignal, onSettled, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Link } from '@tanstack/solid-router';
import { Button, buttonVariants } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';
import { reportClientError } from '@/shared/browser/report-client-error';

function AppErrorPage(props: { error: Error | null }) {
  const detail = untrack(() => props.error?.message) ?? '发生了未知错误';
  const [copyStatus, setCopyStatus] = createSignal<'idle' | 'copied' | 'failed'>('idle');

  const copyError = () => {
    void navigator.clipboard.writeText(detail).then(
      () => setCopyStatus('copied'),
      () => setCopyStatus('failed'),
    );
  };

  return (
    <div
      class='fixed inset-0 z-[100] flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-auto bg-background px-6 py-16'
      role='alert'
      aria-live='assertive'
    >
      <div
        aria-hidden='true'
        class='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-accent)_18%,transparent)_0%,transparent_55%)]'
      />
      <div class='relative w-full max-w-[420px]'>
        <div class='rounded-[var(--radius)] border border-border border-opacity-[0.12] bg-surface px-8 py-10 shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-border)_8%,transparent)]'>
          <p class='text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground'>
            Something went wrong
          </p>
          <h1 class='mt-4 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground'>
            出现错误
          </h1>
          <p class='mt-2 text-sm leading-relaxed text-secondary'>
            页面渲染时发生意外。你可以重新加载当前页，或返回应用首页。
          </p>
          <pre class='mt-6 max-h-40 overflow-auto rounded-md border border-border border-opacity-[0.1] bg-muted px-3 py-2.5 font-mono text-[12px] leading-snug text-secondary [scrollbar-width:thin]'>
            {detail}
          </pre>
          <Button class='mt-2' variant='ghost' size='sm' type='button' onClick={copyError}>
            {copyStatus() === 'copied'
              ? '已复制'
              : copyStatus() === 'failed'
                ? '复制失败'
                : '复制错误信息'}
          </Button>
          <div class='mt-8 flex flex-col gap-3 sm:flex-row sm:items-center'>
            <Button
              class='w-full sm:w-auto'
              size='lg'
              type='button'
              onClick={() => window.location.reload()}
            >
              重新加载
            </Button>
            <Link
              to='/app'
              class={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'w-full justify-center sm:w-auto',
              )}
            >
              返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppErrorFallback(props: { error: unknown }) {
  const value = untrack(() => props.error);
  const error = value instanceof Error ? value : null;
  onSettled(() => {
    reportClientError({
      kind: 'react-boundary',
      message: error?.message ?? '发生了未知错误',
      pageUrl: window.location.href,
      errorName: error?.name,
      stack: error?.stack,
    });
  });
  return <AppErrorPage error={error} />;
}

export function AppErrorBoundary(props: { children: JSX.Element }) {
  const content = createErrorBoundary(
    () => props.children,
    (error) => <AppErrorFallback error={error()} />,
  );
  return <>{content()}</>;
}

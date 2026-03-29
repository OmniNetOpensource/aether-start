import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';
import { reportClientError } from '@/shared/browser/report-client-error';

type Props = { children: ReactNode };

type State = { status: 'ok' } | { status: 'error'; value: Error } | { status: 'unknown' };

function AppErrorPage(props: { error: Error | null }) {
  const detail = props.error?.message ?? '发生了未知错误';

  return (
    <div
      className='fixed inset-0 z-[100] flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-auto bg-(--surface-primary) px-6 py-16'
      role='alert'
      aria-live='assertive'
    >
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,color-mix(in_oklch,var(--content-accent)_18%,transparent)_0%,transparent_55%)]'
      />
      <div className='relative w-full max-w-[420px]'>
        <div className='rounded-[var(--radius)] border border-(--border-primary) border-opacity-[0.12] bg-(--surface-secondary) px-8 py-10 shadow-[0_0_0_1px_color-mix(in_oklch,var(--border-primary)_8%,transparent)]'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.22em] text-(--text-tertiary)'>Something went wrong</p>
          <h1 className='mt-4 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-(--text-primary)'>出现错误</h1>
          <p className='mt-2 text-sm leading-relaxed text-(--text-secondary)'>页面渲染时发生意外。你可以重新加载当前页，或返回应用首页。</p>
          <pre className='mt-6 max-h-40 overflow-auto rounded-md border border-(--border-primary) border-opacity-[0.1] bg-(--surface-muted) px-3 py-2.5 font-mono text-[12px] leading-snug text-(--text-secondary) [scrollbar-width:thin]'>
            {detail}
          </pre>
          <div className='mt-8 flex flex-col gap-3 sm:flex-row sm:items-center'>
            <Button className='w-full sm:w-auto' size='lg' type='button' onClick={() => window.location.reload()}>
              重新加载
            </Button>
            <Link
              to='/app'
              className={cn(
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

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { status: 'ok' };

  private errorReported = false;

  static getDerivedStateFromError(error: unknown): State {
    if (error instanceof Error) {
      return { status: 'error', value: error };
    }
    return { status: 'unknown' };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (this.errorReported) {
      return;
    }
    this.errorReported = true;

    if (typeof window === 'undefined') {
      return;
    }

    const pageUrl = window.location.href;
    const componentStack = info.componentStack ?? undefined;
    if (error instanceof Error) {
      reportClientError({
        kind: 'react-boundary',
        message: error.message,
        pageUrl,
        errorName: error.name,
        stack: error.stack,
        componentStack,
      });
      return;
    }
    reportClientError({
      kind: 'react-boundary',
      message: '发生了未知错误',
      pageUrl,
      componentStack,
    });
  }

  render() {
    if (this.state.status === 'ok') {
      return this.props.children;
    }
    if (this.state.status === 'error') {
      return <AppErrorPage error={this.state.value} />;
    }
    return <AppErrorPage error={null} />;
  }
}

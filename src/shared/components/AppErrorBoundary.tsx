import { Component, type ErrorInfo, type ReactNode } from 'react';
import { toast } from '@/shared/useToast';
import { reportClientError } from '@/shared/lib/report-client-error';

type Props = { children: ReactNode };

type State = { status: 'ok' } | { status: 'error'; value: Error } | { status: 'unknown' };

const errorToastDurationMs = 8000;

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { status: 'ok' };

  private errorToastDisplayed = false;

  static getDerivedStateFromError(error: unknown): State {
    if (error instanceof Error) {
      return { status: 'error', value: error };
    }
    return { status: 'unknown' };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (this.errorToastDisplayed) {
      return;
    }
    this.errorToastDisplayed = true;

    if (typeof window === 'undefined') {
      return;
    }

    if (error instanceof Error) {
      toast.error(`出了点问题：${error.message}（请刷新页面重试）`, errorToastDurationMs);
    } else {
      toast.error('出了点问题：发生了未知错误（请刷新页面重试）', errorToastDurationMs);
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
    return null;
  }
}

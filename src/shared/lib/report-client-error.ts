export type ClientErrorReportKind =
  | 'react-boundary'
  | 'window-error'
  | 'unhandledrejection';

export type ClientErrorReportBody = {
  kind: ClientErrorReportKind;
  message: string;
  pageUrl: string;
  errorName?: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  line?: number;
  column?: number;
  detail?: unknown;
};

export function reportClientError(payload: ClientErrorReportBody): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const body: Record<string, unknown> = {
      kind: payload.kind,
      message: payload.message,
      pageUrl: payload.pageUrl,
    };
    if (payload.errorName !== undefined) {
      body.errorName = payload.errorName;
    }
    if (payload.stack !== undefined) {
      body.stack = payload.stack;
    }
    if (payload.componentStack !== undefined) {
      body.componentStack = payload.componentStack;
    }
    if (payload.source !== undefined) {
      body.source = payload.source;
    }
    if (payload.line !== undefined) {
      body.line = payload.line;
    }
    if (payload.column !== undefined) {
      body.column = payload.column;
    }
    if (payload.detail !== undefined) {
      body.detail = payload.detail;
    }

    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // swallow — must not throw or recurse into global error handlers
  }
}

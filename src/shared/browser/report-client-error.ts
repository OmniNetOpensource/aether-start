export type ClientErrorReportKind = 'react-boundary' | 'window-error' | 'unhandledrejection';

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

const toSerializableDetail = (detail: unknown): unknown => {
  if (detail === undefined) {
    return undefined;
  }

  try {
    JSON.stringify(detail);
    return detail;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      value: String(detail),
    };
  }
};

export function reportClientError(payload: ClientErrorReportBody): void {
  if (typeof window === 'undefined') {
    return;
  }

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
    body.detail = toSerializableDetail(payload.detail);
  }

  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((error) => {
    console.warn('Failed to report client error', error);
  });
}

/** 判断错误是否来自请求中止（AbortController 超时或用户取消） */
export const isAbortError = (error: unknown, signal?: AbortSignal): boolean =>
  (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') ||
  signal?.aborted === true;

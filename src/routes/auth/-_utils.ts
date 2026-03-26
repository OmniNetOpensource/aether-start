/**
 * 登录 / 注册路由共用的查询参数解析与安全跳转。
 *
 * - `redirect`：登录成功后的目标路径，需经过 `getSafeRedirectTarget` 白名单，避免开放重定向。
 * - `reset`：从「重置密码」页返回时带 `success`，登录页用来展示「请用新密码登录」提示。
 * - `email`：预填邮箱（例如从注册页、忘记密码链带回）。
 */
export function validateAuthSearch(search: Record<string, unknown>) {
  const result: { redirect?: string; reset?: 'success'; email?: string } = {};
  if (typeof search.redirect === 'string') result.redirect = search.redirect;
  if (search.reset === 'success') result.reset = 'success';
  if (typeof search.email === 'string') result.email = search.email;
  return result;
}

/** 仅允许站内相对路径；缺省或指向 `/auth` 时落到应用首页，降低开放重定向风险。 */
export const getSafeRedirectTarget = (value: string | undefined) => {
  if (!value || !value.startsWith('/') || value.startsWith('/auth')) {
    return '/app/';
  }
  return value;
};

/** 将 Better Auth / 网络返回的错误转成页面上展示的中文文案。 */
export const getErrorMessage = (error: unknown, mode: 'login' | 'register') => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined;

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  if (
    mode === 'login' &&
    (status === 401 || status === 422 || message.includes('INVALID_EMAIL_OR_PASSWORD'))
  ) {
    return '邮箱或密码错误，或账号不存在';
  }

  if (mode === 'register' && (status === 422 || message.includes('USER_ALREADY_EXISTS'))) {
    return '该邮箱已注册，请直接登录';
  }

  if (message.includes('INVALID_EMAIL')) {
    return '邮箱格式不正确';
  }

  if (message.includes('PASSWORD_TOO_SHORT')) {
    return '密码长度不足';
  }

  if (message.includes('PASSWORD_TOO_LONG')) {
    return '密码过长';
  }

  if (message.includes('fetch failed')) {
    return '网络错误，请稍后重试';
  }

  return mode === 'login' ? '登录失败，请稍后重试' : '注册失败，请稍后重试';
};

/** 登录时若邮箱未验证，应引导用户去注册页的「验证邮箱」流程，而不是只显示通用错误。 */
export const isEmailNotVerifiedError = (error: unknown) => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined;

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  return status === 403 || message.includes('EMAIL_NOT_VERIFIED');
};

/** 注册时 Better Auth 需要 `name`：用邮箱 @ 前本地部分作为展示名。 */
export const getDefaultName = (email: string) => {
  const [prefix] = email.split('@');
  return prefix?.trim() || 'user';
};

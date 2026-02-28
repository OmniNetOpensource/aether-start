import { z } from 'zod'

export const authSearchSchema = z.object({
  redirect: z.string().optional(),
  reset: z.enum(['success']).optional(),
  email: z.string().optional(),
})

export const getSafeRedirectTarget = (value: string | undefined) => {
  if (!value || !value.startsWith('/') || value.startsWith('/auth')) {
    return '/app'
  }
  return value
}

export const getErrorMessage = (error: unknown, mode: 'login' | 'register') => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  if (mode === 'login' && (status === 401 || status === 422 || message.includes('INVALID_EMAIL_OR_PASSWORD'))) {
    return '邮箱或密码错误，或账号不存在'
  }

  if (mode === 'register' && (status === 422 || message.includes('USER_ALREADY_EXISTS'))) {
    return '该邮箱已注册，请直接登录'
  }

  if (message.includes('INVALID_EMAIL')) {
    return '邮箱格式不正确'
  }

  if (message.includes('PASSWORD_TOO_SHORT')) {
    return '密码长度不足'
  }

  if (message.includes('PASSWORD_TOO_LONG')) {
    return '密码过长'
  }

  if (message.includes('fetch failed')) {
    return '网络错误，请稍后重试'
  }

  return mode === 'login' ? '登录失败，请稍后重试' : '注册失败，请稍后重试'
}

export const isEmailNotVerifiedError = (error: unknown) => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  return status === 403 || message.includes('EMAIL_NOT_VERIFIED')
}

export const getDefaultName = (email: string) => {
  const [prefix] = email.split('@')
  return prefix?.trim() || 'user'
}

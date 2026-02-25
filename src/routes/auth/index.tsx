import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { authClient } from '@/features/auth/client/auth-client'
import { getSessionStateFn } from '@/features/auth/server/session-state'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const authSearchSchema = z.object({
  redirect: z.string().optional(),
  reset: z.enum(['success']).optional(),
  email: z.string().optional(),
})

const getSafeRedirectTarget = (value: string | undefined) => {
  if (!value || !value.startsWith('/') || value.startsWith('/auth')) {
    return '/app'
  }

  return value
}

const getErrorMessage = (error: unknown) => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  if (status === 401 || status === 422) {
    return '邮箱或密码错误'
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

  return '登录失败，请稍后重试'
}

const shouldTryAutoSignUp = (error: unknown) => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  return status === 401 || message.includes('INVALID_EMAIL_OR_PASSWORD')
}

const isUserAlreadyExistsError = (error: unknown) => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  return status === 422 || message.includes('USER_ALREADY_EXISTS')
}

const isEmailNotVerifiedError = (error: unknown) => {
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

const getDefaultName = (email: string) => {
  const [prefix] = email.split('@')
  return prefix?.trim() || 'user'
}

export const Route = createFileRoute('/auth/')({
  validateSearch: (search) => authSearchSchema.parse(search),
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn()
    if (sessionState.isAuthenticated) {
      throw redirect({ to: '/app' })
    }
  },
  component: AuthPage,
})

function AuthPage() {
  const navigate = useNavigate()
  const { redirect: redirectTarget, reset, email: initialEmail } = Route.useSearch()

  const target = useMemo(
    () => getSafeRedirectTarget(redirectTarget),
    [redirectTarget],
  )

  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingVerification, setPendingVerification] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [showResetSuccess] = useState(reset === 'success')

  useEffect(() => {
    if (reset !== 'success') {
      return
    }

    void navigate({
      href: redirectTarget
        ? `/auth?redirect=${encodeURIComponent(redirectTarget)}`
        : '/auth',
      replace: true,
    })
  }, [navigate, redirectTarget, reset])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      setErrorMessage('请输入邮箱和密码')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setPendingVerification(false)

    const { error: signInError } = await authClient.signIn.email({
      email: normalizedEmail,
      password,
    })

    if (!signInError) {
      await navigate({ href: target, replace: true })
      return
    }

    if (isEmailNotVerifiedError(signInError)) {
      setPendingVerification(true)
      setIsSubmitting(false)
      return
    }

    if (!shouldTryAutoSignUp(signInError)) {
      setErrorMessage(getErrorMessage(signInError))
      setIsSubmitting(false)
      return
    }

    const { error: signUpError } = await authClient.signUp.email({
      email: normalizedEmail,
      password,
      name: getDefaultName(normalizedEmail),
    })

    if (!signUpError) {
      setPendingVerification(true)
      setIsSubmitting(false)
      return
    }

    if (isUserAlreadyExistsError(signUpError)) {
      setErrorMessage('邮箱或密码错误')
      setIsSubmitting(false)
      return
    }

    setErrorMessage(getErrorMessage(signUpError))
    setIsSubmitting(false)
  }

  const resendVerification = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return

    setIsResending(true)
    setErrorMessage(null)
    await authClient.sendVerificationEmail({
      email: normalizedEmail,
      callbackURL: '/app',
    })
    setIsResending(false)
  }

  if (pendingVerification) {
    return (
      <main className='min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6'>
        <div className='w-full max-w-sm rounded-xl border ink-border bg-(--surface-secondary) p-6 shadow-sm'>
          <div className='mb-4 space-y-1'>
            <h1 className='text-xl font-semibold'>验证邮箱</h1>
            <p className='text-sm text-muted-foreground'>
              验证邮件已发送至 {email.trim().toLowerCase()}，请查收邮箱并点击验证链接。
            </p>
          </div>

          {errorMessage ? (
            <p className='mb-4 text-sm text-red-500'>{errorMessage}</p>
          ) : null}

          <div className='space-y-3'>
            <Button
              className='w-full'
              variant='outline'
              onClick={resendVerification}
              disabled={isResending}
            >
              {isResending ? '发送中...' : '重新发送验证邮件'}
            </Button>
            <Button
              className='w-full'
              variant='ghost'
              onClick={() => setPendingVerification(false)}
            >
              返回登录
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className='min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6'>
      <div className='w-full max-w-sm rounded-xl border ink-border bg-(--surface-secondary) p-6 shadow-sm'>
        <div className='mb-6 space-y-1'>
          <h1 className='text-xl font-semibold'>登录 Aether</h1>
          <p className='text-sm text-muted-foreground'>
            首次输入邮箱密码会自动创建账号
          </p>
        </div>

        {showResetSuccess ? (
          <p className='mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600'>
            密码已重置，请使用新密码登录
          </p>
        ) : null}

        <form className='space-y-4' onSubmit={submit}>
          <div className='space-y-2'>
            <label className='text-sm text-(--text-secondary)' htmlFor='email'>
              邮箱
            </label>
            <Input
              id='email'
              type='email'
              autoComplete='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder='name@example.com'
              disabled={isSubmitting}
              required
            />
          </div>

          <div className='space-y-2'>
            <label className='text-sm text-(--text-secondary)' htmlFor='password'>
              密码
            </label>
            <Input
              id='password'
              type='password'
              autoComplete='current-password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder='请输入密码'
              disabled={isSubmitting}
              required
            />
          </div>

          <div className='flex justify-end'>
            <Link
              to='/auth/forgot-password'
              search={{ email: email.trim() || undefined }}
              className='text-sm text-(--interactive-primary) underline-offset-4 hover:underline'
            >
              忘记密码？
            </Link>
          </div>

          {errorMessage ? (
            <p className='text-sm text-red-500'>{errorMessage}</p>
          ) : null}

          <Button className='w-full' type='submit' disabled={isSubmitting}>
            {isSubmitting ? '提交中...' : '登录 / 注册'}
          </Button>
        </form>
      </div>
    </main>
  )
}

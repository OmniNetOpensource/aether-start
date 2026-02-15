import { FormEvent, useMemo, useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { authClient } from '@/features/auth/client/auth-client'
import { getSessionStateFn } from '@/features/auth/server/session-state'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const authSearchSchema = z.object({
  redirect: z.string().optional(),
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

const getDefaultName = (email: string) => {
  const [prefix] = email.split('@')
  return prefix?.trim() || 'user'
}

export const Route = createFileRoute('/auth')({
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
  const { redirect: redirectTarget } = Route.useSearch()

  const target = useMemo(
    () => getSafeRedirectTarget(redirectTarget),
    [redirectTarget],
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      setErrorMessage('请输入邮箱和密码')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    const { error: signInError } = await authClient.signIn.email({
      email: normalizedEmail,
      password,
    })

    if (!signInError) {
      await navigate({ href: target, replace: true })
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
      await navigate({ href: target, replace: true })
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

  return (
    <main className='min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6'>
      <div className='w-full max-w-sm rounded-xl border ink-border bg-(--surface-secondary) p-6 shadow-sm'>
        <div className='mb-6 space-y-1'>
          <h1 className='text-xl font-semibold'>登录 Aether</h1>
          <p className='text-sm text-muted-foreground'>
            首次输入邮箱密码会自动创建账号
          </p>
        </div>

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

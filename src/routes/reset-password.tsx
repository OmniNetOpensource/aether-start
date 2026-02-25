import { FormEvent, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { authClient } from '@/features/auth/client/auth-client'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const resetPasswordSearchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
})

const isInvalidTokenError = (error: unknown) => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  return message.includes('INVALID_TOKEN')
}

const getResetPasswordErrorMessage = (error: unknown) => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  if (message.includes('INVALID_TOKEN')) {
    return '链接无效或已过期，请重新发起重置'
  }

  if (message.includes('PASSWORD_TOO_SHORT')) {
    return '密码长度不足，请至少输入 8 位'
  }

  if (message.includes('PASSWORD_TOO_LONG')) {
    return '密码过长，请少于 128 位'
  }

  if (message.includes('fetch failed')) {
    return '网络错误，请稍后重试'
  }

  return '重置失败，请稍后重试'
}

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search) => resetPasswordSearchSchema.parse(search),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { token, error } = Route.useSearch()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTokenInvalid, setIsTokenInvalid] = useState(
    !token || error === 'INVALID_TOKEN',
  )

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!token) {
      setIsTokenInvalid(true)
      setErrorMessage(null)
      return
    }

    if (!newPassword || !confirmPassword) {
      setErrorMessage('请输入并确认新密码')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('两次输入的密码不一致')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const { error: resetError } = await authClient.resetPassword({
        token,
        newPassword,
      })

      if (resetError) {
        if (isInvalidTokenError(resetError)) {
          setIsTokenInvalid(true)
          setErrorMessage(null)
          setIsSubmitting(false)
          return
        }

        setErrorMessage(getResetPasswordErrorMessage(resetError))
        setIsSubmitting(false)
        return
      }

      await navigate({
        href: '/auth?reset=success',
        replace: true,
      })
    } catch (resetError) {
      setErrorMessage(getResetPasswordErrorMessage(resetError))
      setIsSubmitting(false)
    }
  }

  return (
    <main className='min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6'>
      <div className='w-full max-w-sm rounded-xl border ink-border bg-(--surface-secondary) p-6 shadow-sm'>
        {isTokenInvalid ? (
          <>
            <div className='mb-6 space-y-1'>
              <h1 className='text-xl font-semibold'>链接无效或已过期</h1>
              <p className='text-sm text-muted-foreground'>
                请重新发起密码重置，获取最新链接。
              </p>
            </div>
            <div className='space-y-3'>
              <Button asChild className='w-full'>
                <Link to='/forgot-password'>重新发起重置</Link>
              </Button>
              <Button asChild className='w-full' variant='ghost'>
                <Link to='/auth'>返回登录</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className='mb-6 space-y-1'>
              <h1 className='text-xl font-semibold'>重置密码</h1>
              <p className='text-sm text-muted-foreground'>
                请输入你的新密码并确认
              </p>
            </div>

            <form className='space-y-4' onSubmit={submit}>
              <div className='space-y-2'>
                <label className='text-sm text-(--text-secondary)' htmlFor='newPassword'>
                  新密码
                </label>
                <Input
                  id='newPassword'
                  type='password'
                  autoComplete='new-password'
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder='请输入新密码'
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className='space-y-2'>
                <label
                  className='text-sm text-(--text-secondary)'
                  htmlFor='confirmPassword'
                >
                  确认新密码
                </label>
                <Input
                  id='confirmPassword'
                  type='password'
                  autoComplete='new-password'
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder='请再次输入新密码'
                  disabled={isSubmitting}
                  required
                />
              </div>

              {errorMessage ? (
                <p className='text-sm text-red-500'>{errorMessage}</p>
              ) : null}

              <Button className='w-full' type='submit' disabled={isSubmitting}>
                {isSubmitting ? '提交中...' : '确认重置'}
              </Button>

              <Button className='w-full' variant='ghost' asChild>
                <Link to='/auth'>返回登录</Link>
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}

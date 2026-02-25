import { FormEvent, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { authClient } from '@/features/auth/client/auth-client'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const getForgotPasswordErrorMessage = (error: unknown) => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''

  if (message.includes('INVALID_EMAIL')) {
    return '邮箱格式不正确'
  }

  if (message.includes('fetch failed')) {
    return '网络错误，请稍后重试'
  }

  return '发送失败，请稍后重试'
}

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setErrorMessage('请输入邮箱')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const { error } = await authClient.requestPasswordReset({
        email: normalizedEmail,
        redirectTo: '/reset-password',
      })

      if (error) {
        setErrorMessage(getForgotPasswordErrorMessage(error))
        setIsSubmitting(false)
        return
      }

      setIsSubmitted(true)
    } catch (error) {
      setErrorMessage(getForgotPasswordErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className='min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6'>
      <div className='w-full max-w-sm rounded-xl border ink-border bg-(--surface-secondary) p-6 shadow-sm'>
        <div className='mb-6 space-y-1'>
          <h1 className='text-xl font-semibold'>忘记密码</h1>
          <p className='text-sm text-muted-foreground'>
            输入你的注册邮箱，我们会发送重置链接
          </p>
        </div>

        {isSubmitted ? (
          <div className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              如果该邮箱已注册，你将收到重置邮件。
            </p>
            <Button asChild className='w-full'>
              <Link to='/auth'>返回登录</Link>
            </Button>
          </div>
        ) : (
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

            {errorMessage ? (
              <p className='text-sm text-red-500'>{errorMessage}</p>
            ) : null}

            <Button className='w-full' type='submit' disabled={isSubmitting}>
              {isSubmitting ? '发送中...' : '发送重置邮件'}
            </Button>

            <Button className='w-full' variant='ghost' asChild>
              <Link to='/auth'>返回登录</Link>
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}

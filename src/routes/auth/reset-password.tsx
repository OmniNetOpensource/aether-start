import { FormEvent, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { authClient } from '@/lib/auth/auth-client'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { cn } from '@/lib/utils'

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

export const Route = createFileRoute('/auth/reset-password')({
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
    <main className="min-h-screen w-full bg-background relative overflow-hidden flex items-center justify-center p-6">
      {/* Abstract background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-(--interactive-primary)/10 via-background to-background" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-(--interactive-primary)/30 to-transparent" />

      <motion.div 
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-2xl border ink-border bg-(--surface-secondary)/80 backdrop-blur-xl p-8 shadow-2xl relative z-10"
      >
        <div className="mb-8 space-y-2 text-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className={cn(
              "mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-6 shadow-sm rotate-3 hover:rotate-0 transition-transform cursor-default",
              isTokenInvalid ? "bg-(--status-destructive)/10 text-(--status-destructive)" : "bg-foreground text-background"
            )}
          >
            {isTokenInvalid ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            )}
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isTokenInvalid ? '链接已失效' : '重置密码'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isTokenInvalid ? '请重新发起密码重置，获取最新链接' : '请输入你的新密码并确认'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {isTokenInvalid ? (
            <motion.div
              key="invalid"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <Button asChild className="w-full">
                <Link to="/auth/forgot-password">重新发起重置</Link>
              </Button>
              <Button asChild className="w-full" variant="ghost">
                <Link to="/auth">返回登录</Link>
              </Button>
            </motion.div>
          ) : (
            <motion.form 
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5" 
              onSubmit={submit}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-(--text-secondary)" htmlFor="newPassword">
                  新密码
                </label>
                <PasswordInput
                  id="newPassword"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="至少 8 位密码"
                  disabled={isSubmitting}
                  className={cn(errorMessage && "border-(--status-destructive) focus-visible:ring-(--status-destructive)/20")}
                  required
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-(--text-secondary)"
                  htmlFor="confirmPassword"
                >
                  确认新密码
                </label>
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="请再次输入新密码"
                  disabled={isSubmitting}
                  className={cn(errorMessage && "border-(--status-destructive) focus-visible:ring-(--status-destructive)/20")}
                  required
                />
              </div>

              <div className="min-h-[20px]">
                <AnimatePresence mode="popLayout">
                  {errorMessage && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="text-sm text-(--status-destructive) flex items-center gap-1.5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                      {errorMessage}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-3">
                <Button className="w-full relative overflow-hidden" type="submit" disabled={isSubmitting}>
                  <AnimatePresence mode="wait">
                    {isSubmitting ? (
                      <motion.div
                        key="submitting"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>提交中...</span>
                      </motion.div>
                    ) : (
                      <motion.span
                        key="idle"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        确认重置
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>

                <Button className="w-full" variant="ghost" asChild>
                  <Link to="/auth">返回登录</Link>
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  )
}

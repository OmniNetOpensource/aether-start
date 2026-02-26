import { FormEvent, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { authClient } from '@/lib/auth/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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

const forgotPasswordSearchSchema = z.object({
  email: z.string().optional(),
})

export const Route = createFileRoute('/auth/forgot-password')({
  validateSearch: (search) => forgotPasswordSearchSchema.parse(search),
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const { email: initialEmail } = Route.useSearch()
  const [email, setEmail] = useState(initialEmail ?? '')
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
        redirectTo: '/auth/reset-password',
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
            className="mx-auto w-12 h-12 bg-foreground text-background rounded-xl flex items-center justify-center mb-6 shadow-sm rotate-3 hover:rotate-0 transition-transform cursor-default"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight">找回密码</h1>
          <p className="text-sm text-muted-foreground">
            {isSubmitted ? '重置邮件已发送' : '输入你的注册邮箱，我们会发送重置链接'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {isSubmitted ? (
            <motion.div
              key="submitted"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-start gap-3">
                <svg className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  如果该邮箱已注册，你将在几分钟内收到包含重置链接的邮件。
                </p>
              </div>
              <Button asChild className="w-full">
                <Link to="/auth" search={{ email: email.trim() || undefined }}>返回登录</Link>
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
                <label className="text-sm font-medium text-(--text-secondary)" htmlFor="email">
                  邮箱
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
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
                        <span>发送中...</span>
                      </motion.div>
                    ) : (
                      <motion.span
                        key="idle"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        发送重置邮件
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>

                <Button className="w-full" variant="ghost" asChild>
                  <Link to="/auth" search={{ email: email.trim() || undefined }}>返回登录</Link>
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  )
}

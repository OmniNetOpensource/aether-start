import { FormEvent, useEffect, useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { authClient } from '@/lib/auth/auth-client'
import { getSessionStateFn } from '@/server/functions/auth/session-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { cn } from '@/lib/utils'
import {
  authSearchSchema,
  getSafeRedirectTarget,
  getErrorMessage,
  isEmailNotVerifiedError,
} from './-_utils'

export const Route = createFileRoute('/auth/login')({
  validateSearch: (search) => authSearchSchema.parse(search),
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn()
    if (sessionState.isAuthenticated) {
      throw redirect({ to: '/app' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { redirect: redirectTarget, reset, email: initialEmail } = Route.useSearch()
  const target = getSafeRedirectTarget(redirectTarget)

  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showResetSuccess] = useState(reset === 'success')

  useEffect(() => {
    if (reset !== 'success') return
    const qs = redirectTarget ? `?redirect=${encodeURIComponent(redirectTarget)}` : ''
    void navigate({ href: `/auth/login${qs}`, replace: true })
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

    const { error: signInError } = await authClient.signIn.email({
      email: normalizedEmail,
      password,
    })

    if (!signInError) {
      await navigate({ href: target, replace: true })
      return
    }

    if (isEmailNotVerifiedError(signInError)) {
      const qs = new URLSearchParams({ email: normalizedEmail })
      if (redirectTarget) qs.set('redirect', redirectTarget)
      await navigate({ href: `/auth/verify-email?${qs}`, replace: true })
      return
    }

    setErrorMessage(getErrorMessage(signInError, 'login'))
    setIsSubmitting(false)
  }

  return (
    <main className="min-h-screen w-full bg-background relative overflow-hidden flex items-center justify-center p-6">
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
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight">欢迎来到 Aether</h1>
          <p className="text-sm text-muted-foreground">输入邮箱即可开启探索</p>
        </div>

        <AnimatePresence mode="popLayout">
          {showResetSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-start gap-3"
            >
              <svg className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                密码已重置，请使用新密码登录
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <form className="space-y-5" onSubmit={submit}>
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
              className={cn(errorMessage && errorMessage.includes('邮箱') && "border-(--status-destructive) focus-visible:ring-(--status-destructive)/20")}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-(--text-secondary)" htmlFor="password">
                密码
              </label>
              <Link
                to="/auth/forgot-password"
                search={{ email: email.trim() || undefined }}
                className="text-xs font-medium text-(--interactive-primary) hover:underline"
              >
                忘记密码？
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              disabled={isSubmitting}
              className={cn(errorMessage && errorMessage.includes('密码') && "border-(--status-destructive) focus-visible:ring-(--status-destructive)/20")}
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
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                  {errorMessage}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

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
                  <span>处理中...</span>
                </motion.div>
              ) : (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  登录
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          还没有账号？{' '}
          <Link
            to="/auth/register"
            search={{ redirect: redirectTarget }}
            className="font-medium text-(--interactive-primary) hover:underline"
          >
            注册
          </Link>
        </p>
      </motion.div>
    </main>
  )
}
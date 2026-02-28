import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { authClient } from '@/lib/auth/auth-client'
import { getSessionStateFn } from '@/server/functions/auth/session-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { cn } from '@/lib/utils'

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

const getErrorMessage = (error: unknown, mode: 'login' | 'register') => {
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

  const target = getSafeRedirectTarget(redirectTarget)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingVerification, setPendingVerification] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [showResetSuccess] = useState(reset === 'success')
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', ''])
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const next = [...otpValues]
    next[index] = value.slice(-1)
    setOtpValues(next)
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...otpValues]
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || ''
    }
    setOtpValues(next)
    const focusIndex = Math.min(pasted.length, 5)
    otpInputRefs.current[focusIndex]?.focus()
  }

  const verifyOtp = async () => {
    const otp = otpValues.join('')
    if (otp.length !== 6) return

    setIsVerifyingOtp(true)
    setErrorMessage(null)

    const { error } = await authClient.emailOtp.verifyEmail({
      email: email.trim().toLowerCase(),
      otp,
    })

    if (!error) {
      await navigate({ href: target, replace: true })
      return
    }

    const msg = typeof error === 'object' && 'message' in error ? String(error.message) : ''
    if (msg.includes('OTP_EXPIRED') || msg.includes('expired')) {
      setErrorMessage('验证码已过期，请重新发送')
    } else if (msg.includes('INVALID_OTP') || msg.includes('Invalid')) {
      setErrorMessage('验证码错误，请重新输入')
    } else if (msg.includes('TOO_MANY_ATTEMPTS')) {
      setErrorMessage('尝试次数过多，请重新发送验证码')
    } else {
      setErrorMessage('验证失败，请稍后重试')
    }
    setOtpValues(['', '', '', '', '', ''])
    otpInputRefs.current[0]?.focus()
    setIsVerifyingOtp(false)
  }

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

    if (mode === 'login') {
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

      setErrorMessage(getErrorMessage(signInError, 'login'))
      setIsSubmitting(false)
    } else {
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

      setErrorMessage(getErrorMessage(signUpError, 'register'))
      setIsSubmitting(false)
    }
  }

  const resendVerification = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return

    setIsResending(true)
    setErrorMessage(null)
    setOtpValues(['', '', '', '', '', ''])
    await authClient.emailOtp.sendVerificationOtp({
      email: normalizedEmail,
      type: 'email-verification',
    })
    setIsResending(false)
    otpInputRefs.current[0]?.focus()
  }

  if (pendingVerification) {
    return (
      <main className="min-h-screen w-full bg-background relative overflow-hidden flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-(--interactive-primary)/10 via-background to-background" />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm rounded-2xl border ink-border bg-(--surface-secondary)/80 backdrop-blur-xl p-8 shadow-2xl relative z-10"
        >
          <div className="mb-6 space-y-2 text-center">
            <div className="mx-auto w-12 h-12 bg-(--interactive-primary)/10 text-(--interactive-primary) rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">验证邮箱</h1>
            <p className="text-sm text-muted-foreground">
              验证码已发送至 <span className="font-medium text-foreground">{email.trim().toLowerCase()}</span>
            </p>
          </div>

          <div className="flex justify-center gap-2 mb-6" onPaste={handleOtpPaste}>
            {otpValues.map((val, i) => (
              <input
                key={i}
                ref={(el) => { otpInputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={val}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className={cn(
                  'w-11 h-13 text-center text-xl font-semibold rounded-lg border bg-background outline-none transition-all',
                  'focus:ring-2 focus:ring-(--interactive-primary)/40 focus:border-(--interactive-primary)',
                  errorMessage ? 'border-(--status-destructive)' : 'ink-border',
                )}
                disabled={isVerifyingOtp}
                autoFocus={i === 0}
              />
            ))}
          </div>

          <AnimatePresence>
            {errorMessage && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 text-sm text-(--status-destructive) text-center"
              >
                {errorMessage}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={verifyOtp}
              disabled={isVerifyingOtp || otpValues.join('').length !== 6}
            >
              {isVerifyingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isVerifyingOtp ? '验证中...' : '验证'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={resendVerification}
              disabled={isResending}
            >
              {isResending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isResending ? '发送中...' : '重新发送验证码'}
            </Button>
            <Button
              className="w-full"
              variant="ghost"
              onClick={() => {
                setPendingVerification(false)
                setOtpValues(['', '', '', '', '', ''])
                setErrorMessage(null)
              }}
            >
              返回登录
            </Button>
          </div>
        </motion.div>
      </main>
    )
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
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight">欢迎来到 Aether</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? '输入邮箱即可开启探索' : '注册新账号以开始使用'}
          </p>
        </div>

        <div className="flex p-1 mb-8 bg-(--surface-muted)/50 rounded-lg">
          <button
            type="button"
            className={cn(
              "flex-1 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
              mode === 'login' 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => {
              setMode('login')
              setErrorMessage(null)
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
              mode === 'register' 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => {
              setMode('register')
              setErrorMessage(null)
            }}
          >
            注册
          </button>
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
              {mode === 'login' && (
                <Link
                  to="/auth/forgot-password"
                  search={{ email: email.trim() || undefined }}
                  className="text-xs font-medium text-(--interactive-primary) hover:underline"
                >
                  忘记密码？
                </Link>
              )}
            </div>
            <PasswordInput
              id="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'login' ? '请输入密码' : '至少 8 位密码'}
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
                  {mode === 'login' ? '登录' : '注册账号'}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </form>
      </motion.div>
    </main>
  )
}

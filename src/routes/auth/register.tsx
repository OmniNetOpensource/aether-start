import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'
import { authClient } from '@/lib/auth/auth-client'
import { getSessionStateFn } from '@/server/functions/auth/session-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { cn } from '@/lib/utils'
import {
  authSearchSchema,
  getDefaultName,
  getErrorMessage,
  getSafeRedirectTarget,
} from './-_utils'

const searchSchema = authSearchSchema.extend({
  verify: z.enum(['true']).optional(),
})

export const Route = createFileRoute('/auth/register')({
  validateSearch: (search) => searchSchema.parse(search),
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn()
    if (sessionState.isAuthenticated) {
      throw redirect({ to: '/app' })
    }
  },
  component: RegisterPage,
})

function RegisterPage() {
  const {
    email: routeEmail,
    redirect: redirectTarget,
    verify,
  } = Route.useSearch()
  const normalizedRouteEmail = routeEmail?.trim().toLowerCase() ?? ''
  const isVerifyMode = verify === 'true' && normalizedRouteEmail.length > 0
  const target = getSafeRedirectTarget(redirectTarget)

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#e8e4dc] via-background to-background" />
      <div className="absolute top-0 left-0 right-0 h-px bg-(--interactive-primary)" />

      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-sm rounded-2xl border bg-(--surface-secondary) p-8 shadow-2xl backdrop-blur-xl ink-border"
      >
        {isVerifyMode ? (
          <VerifyEmailPanel
            key={normalizedRouteEmail}
            email={normalizedRouteEmail}
            redirectTarget={redirectTarget}
            target={target}
          />
        ) : (
          <RegisterForm
            key={normalizedRouteEmail || 'register'}
            initialEmail={normalizedRouteEmail}
            redirectTarget={redirectTarget}
          />
        )}
      </motion.div>
    </main>
  )
}

function RegisterForm({ initialEmail, redirectTarget }: { initialEmail: string, redirectTarget?: string }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password || !confirmPassword) {
      setFormErrorMessage('请输入邮箱和两次密码')
      return
    }

    if (password !== confirmPassword) {
      setFormErrorMessage('两次输入的密码不一致')
      return
    }

    setIsSubmitting(true)
    setFormErrorMessage(null)

    const { error: signUpError } = await authClient.signUp.email({
      email: normalizedEmail,
      password,
      name: getDefaultName(normalizedEmail),
    })

    if (signUpError) {
      setFormErrorMessage(getErrorMessage(signUpError, 'register'))
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    setPassword('')
    await navigate({
      to: '/auth/register',
      search: {
        email: normalizedEmail,
        redirect: redirectTarget,
        verify: 'true',
      },
      replace: true,
    })
  }

  return (
    <>
      <div className="mb-8 space-y-2 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mx-auto mb-6 flex h-12 w-12 rotate-3 cursor-default items-center justify-center rounded-xl bg-foreground text-background shadow-sm transition-transform hover:rotate-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
        </motion.div>
        <h1 className="text-2xl font-bold tracking-tight">创建账号</h1>
        <p className="text-sm text-muted-foreground">注册后即可开始使用</p>
      </div>

      <form className="space-y-5" onSubmit={submit}>
        <div className="space-y-2">
          <label className="text-sm font-medium text-(--text-secondary)" htmlFor="reg-email">
            邮箱
          </label>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            disabled={isSubmitting}
            className={cn(formErrorMessage && formErrorMessage.includes('邮箱') && 'border-(--status-destructive) focus-visible:ring-(--status-destructive)')}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-(--text-secondary)" htmlFor="reg-password">
            密码
          </label>
          <PasswordInput
            id="reg-password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 个字符"
            disabled={isSubmitting}
            className={cn(formErrorMessage && formErrorMessage.includes('密码') && 'border-(--status-destructive) focus-visible:ring-(--status-destructive)')}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-(--text-secondary)" htmlFor="reg-password-confirm">
            确认密码
          </label>
          <PasswordInput
            id="reg-password-confirm"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="请再次输入密码"
            disabled={isSubmitting}
            className={cn(
              formErrorMessage &&
                formErrorMessage.includes('密码') &&
                'border-(--status-destructive) focus-visible:ring-(--status-destructive)',
            )}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-(--text-secondary)" htmlFor="reg-code">
            验证码
          </label>
          <div className="flex gap-2">
            <Input
              id="reg-code"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              placeholder="请输入验证码"
              disabled={isSubmitting}
              className="flex-1"
            />
            <Button type="button" variant="outline" disabled={isSubmitting}>
              发送验证码
            </Button>
          </div>
        </div>

        <div className="min-h-[20px]">
          <AnimatePresence mode="popLayout">
            {formErrorMessage && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex items-center gap-1.5 text-sm text-(--status-destructive)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                {formErrorMessage}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <Button className="relative w-full overflow-hidden" type="submit" disabled={isSubmitting}>
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
                注册
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        已有账号？{' '}
        <Link
          to="/auth/login"
          search={{ redirect: redirectTarget }}
          className="font-medium text-(--interactive-primary) hover:underline"
        >
          登录
        </Link>
      </p>
    </>
  )
}

function VerifyEmailPanel({
  email,
  redirectTarget,
  target,
}: {
  email: string
  redirectTarget?: string
  target: string
}) {
  const navigate = useNavigate()
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', ''])
  const [verifyErrorMessage, setVerifyErrorMessage] = useState<string | null>(null)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0)
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendCooldownSeconds <= 0) return
    const id = setInterval(() => {
      setResendCooldownSeconds((seconds) => (seconds <= 1 ? 0 : seconds - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [resendCooldownSeconds])

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const next = [...otpValues]
    next[index] = value.slice(-1)
    setOtpValues(next)
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, event: React.KeyboardEvent) => {
    if (event.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (event: React.ClipboardEvent) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...otpValues]
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || ''
    }
    setOtpValues(next)
    otpInputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const verifyOtp = async () => {
    const otp = otpValues.join('')
    if (otp.length !== 6) return

    setIsVerifyingOtp(true)
    setVerifyErrorMessage(null)

    const { error } = await authClient.emailOtp.verifyEmail({
      email,
      otp,
    })

    if (!error) {
      await navigate({ href: target, replace: true })
      return
    }

    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : ''

    if (message.includes('OTP_EXPIRED') || message.includes('expired')) {
      setVerifyErrorMessage('验证码已过期，请重新发送')
    } else if (message.includes('INVALID_OTP') || message.includes('Invalid')) {
      setVerifyErrorMessage('验证码错误，请重新输入')
    } else if (message.includes('TOO_MANY_ATTEMPTS')) {
      setVerifyErrorMessage('尝试次数过多，请重新发送验证码')
    } else {
      setVerifyErrorMessage('验证失败，请稍后重试')
    }

    setOtpValues(['', '', '', '', '', ''])
    otpInputRefs.current[0]?.focus()
    setIsVerifyingOtp(false)
  }

  const resendVerification = async () => {
    if (resendCooldownSeconds > 0) return

    setIsResending(true)
    setVerifyErrorMessage(null)
    setOtpValues(['', '', '', '', '', ''])
    await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'email-verification',
    })
    setResendCooldownSeconds(30)
    setIsResending(false)
    otpInputRefs.current[0]?.focus()
  }

  return (
    <>
      <div className="mb-6 space-y-2 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8e4dc] text-(--interactive-primary)">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">验证邮箱</h1>
        <p className="text-sm text-muted-foreground">
          验证码已发送至 <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>

      <div className="mb-6 flex justify-center gap-2" onPaste={handleOtpPaste}>
        {otpValues.map((value, index) => (
          <input
            key={index}
            ref={(element) => { otpInputRefs.current[index] = element }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value}
            onChange={(event) => handleOtpChange(index, event.target.value)}
            onKeyDown={(event) => handleOtpKeyDown(index, event)}
            className={cn(
              'h-13 w-11 rounded-lg border bg-background text-center text-xl font-semibold outline-none transition-all',
              'focus:border-(--interactive-primary) focus:ring-2 focus:ring-(--interactive-primary)',
              verifyErrorMessage ? 'border-(--status-destructive)' : 'ink-border',
            )}
            disabled={isVerifyingOtp}
            autoFocus={index === 0}
          />
        ))}
      </div>

      <AnimatePresence>
        {verifyErrorMessage && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 text-center text-sm text-(--status-destructive)"
          >
            {verifyErrorMessage}
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
          disabled={isResending || resendCooldownSeconds > 0}
        >
          {isResending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isResending
            ? '发送中...'
            : resendCooldownSeconds > 0
              ? `${resendCooldownSeconds} 秒后重试`
              : '重新发送验证码'}
        </Button>
        <Button
          className="w-full"
          variant="ghost"
          onClick={() =>
            navigate({
              to: '/auth/login',
              search: {
                email,
                redirect: redirectTarget,
              },
            })}
        >
          返回登录
        </Button>
      </div>
    </>
  )
}

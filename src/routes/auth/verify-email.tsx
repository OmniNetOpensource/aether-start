import { useEffect, useRef, useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'
import { authClient } from '@/lib/auth/auth-client'
import { getSessionStateFn } from '@/server/functions/auth/session-state'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getSafeRedirectTarget } from './-_utils'

const searchSchema = z.object({
  email: z.string(),
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/auth/verify-email')({
  validateSearch: (search) => searchSchema.parse(search),
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn()
    if (sessionState.isAuthenticated) {
      throw redirect({ to: '/app' })
    }
  },
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const navigate = useNavigate()
  const { email, redirect: redirectTarget } = Route.useSearch()
  const target = getSafeRedirectTarget(redirectTarget)

  const [otpValues, setOtpValues] = useState(['', '', '', '', '', ''])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0)
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

  const resendVerification = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || resendCooldownSeconds > 0) return

    setIsResending(true)
    setErrorMessage(null)
    setOtpValues(['', '', '', '', '', ''])
    await authClient.emailOtp.sendVerificationOtp({
      email: normalizedEmail,
      type: 'email-verification',
    })
    setResendCooldownSeconds(30)
    setIsResending(false)
    otpInputRefs.current[0]?.focus()
  }

  useEffect(() => {
    if (resendCooldownSeconds <= 0) return
    const id = setInterval(() => {
      setResendCooldownSeconds((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [resendCooldownSeconds])

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
                  email: email.trim().toLowerCase(),
                  redirect: redirectTarget,
                },
              })}
          >
            返回登录
          </Button>
        </div>
      </motion.div>
    </main>
  )
}

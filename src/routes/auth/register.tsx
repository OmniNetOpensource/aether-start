import { useActionState, useEffect, useRef, useState } from 'react';
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/features/auth/auth-client';
import { getSessionStateFn } from '@/features/auth/session';
import { Button } from '@/shared/design-system/button';
import { Input } from '@/shared/design-system/input';
import { PasswordInput } from '@/shared/design-system/password-input';
import { cn } from '@/shared/core/utils';
import {
  validateAuthSearch,
  getDefaultName,
  getErrorMessage,
  getSafeRedirectTarget,
} from './-_utils';

/**
 * 注册与邮箱验证（OTP）。
 *
 * - 默认：`RegisterForm` 收集邮箱与密码，调用 `signUp.email`；成功后 `replace` 到同一路由并带上
 *   `verify=true` 与 `email`，切换为 `VerifyEmailPanel`。
 * - 验证模式：6 位 OTP，支持粘贴、退格回退焦点；验证成功后按 `getSafeRedirectTarget(redirect)` 跳转。
 * - `search.verify` 仅在 `validateSearch` 中从原始 query 透传，用于区分「填表」与「收邮件验证码」两阶段。
 */
export const Route = createFileRoute('/auth/register')({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { redirect?: string; reset?: 'success'; email?: string; verify?: 'true' } =
      validateAuthSearch(search);
    if (search.verify === 'true') result.verify = 'true';
    return result;
  },
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn();
    if (sessionState.isAuthenticated) {
      throw redirect({ to: '/app' });
    }
  },
  component: RegisterPage,
});

/** 根据是否处于「验证邮箱」阶段，在表单与 OTP 面板之间切换。 */
function RegisterPage() {
  const { email: routeEmail, redirect: redirectTarget, verify } = Route.useSearch();
  const normalizedRouteEmail = routeEmail?.trim().toLowerCase() ?? '';
  const isVerifyMode = verify === 'true' && normalizedRouteEmail.length > 0;
  const target = getSafeRedirectTarget(redirectTarget);

  return (
    <div className='w-full max-w-sm rounded-2xl border bg-surface p-8 shadow-2xl backdrop-blur-xl  animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300'>
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
    </div>
  );
}

type RegisterFormState = {
  error: string | null;
};

/** 注册第一步：提交邮箱与密码后进入同路由的 verify 阶段。 */
function RegisterForm({
  initialEmail,
  redirectTarget,
}: {
  initialEmail: string;
  redirectTarget?: string;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  const [formState, formAction, isPending] = useActionState(
    async (_prev: RegisterFormState, formData: FormData): Promise<RegisterFormState> => {
      const emailRaw = formData.get('email');
      const passwordRaw = formData.get('password');
      const confirmPasswordRaw = formData.get('confirmPassword');
      const normalizedEmail = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
      const passwordValue = typeof passwordRaw === 'string' ? passwordRaw : '';
      const confirmPasswordValue = typeof confirmPasswordRaw === 'string' ? confirmPasswordRaw : '';

      if (!normalizedEmail || !passwordValue || !confirmPasswordValue) {
        return { error: '请输入邮箱和两次密码' };
      }

      if (passwordValue !== confirmPasswordValue) {
        return { error: '两次输入的密码不一致' };
      }

      const { error: signUpError } = await authClient.signUp.email({
        email: normalizedEmail,
        password: passwordValue,
        name: getDefaultName(normalizedEmail),
      });

      if (signUpError) {
        return { error: getErrorMessage(signUpError, 'register') };
      }

      await navigate({
        to: '/auth/register',
        search: {
          email: normalizedEmail,
          redirect: redirectTarget,
          verify: 'true',
        },
        replace: true,
      });
      return { error: null };
    },
    { error: null },
  );

  const formErrorMessage = formState.error;

  return (
    <>
      <div className='mb-8 space-y-2 text-center'>
        <div className='mx-auto mb-6 flex h-12 w-12 rotate-3 cursor-default items-center justify-center rounded-xl bg-foreground text-background shadow-sm transition-transform hover:rotate-0 animate-in fade-in zoom-in-90 duration-300'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='24'
            height='24'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z' />
          </svg>
        </div>
        <h1 className='text-2xl font-bold tracking-tight'>创建账号</h1>
        <p className='text-sm text-muted-foreground'>注册后即可开始使用</p>
      </div>

      <form className='space-y-5' action={formAction}>
        <div className='space-y-2'>
          <label className='text-sm font-medium text-secondary' htmlFor='reg-email'>
            邮箱
          </label>
          <Input
            id='reg-email'
            name='email'
            type='email'
            autoComplete='email'
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder='name@example.com'
            disabled={isPending}
            className={cn(
              formErrorMessage &&
                formErrorMessage.includes('邮箱') &&
                'border-destructive focus-visible:ring-destructive',
            )}
            required
          />
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium text-secondary' htmlFor='reg-password'>
            密码
          </label>
          <PasswordInput
            id='reg-password'
            name='password'
            autoComplete='new-password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder='至少 8 个字符'
            disabled={isPending}
            className={cn(
              formErrorMessage &&
                formErrorMessage.includes('密码') &&
                'border-destructive focus-visible:ring-destructive',
            )}
            required
          />
        </div>

        <div className='space-y-2'>
          <label
            className='text-sm font-medium text-secondary'
            htmlFor='reg-password-confirm'
          >
            确认密码
          </label>
          <PasswordInput
            id='reg-password-confirm'
            name='confirmPassword'
            autoComplete='new-password'
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder='请再次输入密码'
            disabled={isPending}
            className={cn(
              formErrorMessage &&
                formErrorMessage.includes('密码') &&
                'border-destructive focus-visible:ring-destructive',
            )}
            required
          />
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium text-secondary' htmlFor='reg-code'>
            验证码
          </label>
          <div className='flex gap-2'>
            <Input
              id='reg-code'
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              placeholder='请输入验证码'
              disabled={isPending}
              className='flex-1'
            />
            <Button type='button' variant='outline' disabled={isPending}>
              发送验证码
            </Button>
          </div>
        </div>

        <div className='min-h-[20px]'>
          {formErrorMessage ? (
            <p className='flex items-center gap-1.5 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='14'
                height='14'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
              >
                <circle cx='12' cy='12' r='10' />
                <line x1='12' x2='12' y1='8' y2='12' />
                <line x1='12' x2='12.01' y1='16' y2='16' />
              </svg>
              {formErrorMessage}
            </p>
          ) : null}
        </div>

        <Button className='relative w-full overflow-hidden' type='submit' disabled={isPending}>
          {isPending ? (
            <span className='flex items-center gap-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span>处理中...</span>
            </span>
          ) : (
            '注册'
          )}
        </Button>
      </form>

      <p className='mt-6 text-center text-sm text-muted-foreground'>
        已有账号？{' '}
        <Link
          to='/auth/login'
          search={{ redirect: redirectTarget }}
          className='font-medium text-primary hover:underline'
        >
          登录
        </Link>
      </p>
    </>
  );
}

/**
 * 注册第二步：邮箱 OTP。输入满 6 位或点击「验证」调用 `emailOtp.verifyEmail`；
 * 「重新发送」带 30s 冷却，避免频繁请求。
 */
function VerifyEmailPanel({
  email,
  redirectTarget,
  target,
}: {
  email: string;
  redirectTarget?: string;
  target: string;
}) {
  const navigate = useNavigate();
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
  const [verifyErrorMessage, setVerifyErrorMessage] = useState<string | null>(null);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 重发冷却：每秒递减，到 0 时清除 interval。
  useEffect(() => {
    if (resendCooldownSeconds <= 0) return;
    const id = setInterval(() => {
      setResendCooldownSeconds((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldownSeconds]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otpValues];
    next[index] = value.slice(-1);
    setOtpValues(next);
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, event: React.KeyboardEvent) => {
    if (event.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...otpValues];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || '';
    }
    setOtpValues(next);
    otpInputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const verifyOtp = async () => {
    const otp = otpValues.join('');
    if (otp.length !== 6) return;

    setIsVerifyingOtp(true);
    setVerifyErrorMessage(null);

    const { error } = await authClient.emailOtp.verifyEmail({
      email,
      otp,
    });

    if (!error) {
      await navigate({ href: target, replace: true });
      return;
    }

    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';

    if (message.includes('OTP_EXPIRED') || message.includes('expired')) {
      setVerifyErrorMessage('验证码已过期，请重新发送');
    } else if (message.includes('INVALID_OTP') || message.includes('Invalid')) {
      setVerifyErrorMessage('验证码错误，请重新输入');
    } else if (message.includes('TOO_MANY_ATTEMPTS')) {
      setVerifyErrorMessage('尝试次数过多，请重新发送验证码');
    } else {
      setVerifyErrorMessage('验证失败，请稍后重试');
    }

    setOtpValues(['', '', '', '', '', '']);
    otpInputRefs.current[0]?.focus();
    setIsVerifyingOtp(false);
  };

  const resendVerification = async () => {
    if (resendCooldownSeconds > 0) return;

    setIsResending(true);
    setVerifyErrorMessage(null);
    setOtpValues(['', '', '', '', '', '']);
    await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'email-verification',
    });
    setResendCooldownSeconds(30);
    setIsResending(false);
    otpInputRefs.current[0]?.focus();
  };

  return (
    <>
      <div className='mb-6 space-y-2 text-center'>
        <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-primary'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='24'
            height='24'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8' />
            <path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' />
            <path d='m16 19 2 2 4-4' />
          </svg>
        </div>
        <h1 className='text-2xl font-bold tracking-tight'>验证邮箱</h1>
        <p className='text-sm text-muted-foreground'>
          验证码已发送至 <span className='font-medium text-foreground'>{email}</span>
        </p>
      </div>

      <div className='mb-6 flex justify-center gap-2' onPaste={handleOtpPaste}>
        {otpValues.map((value, index) => (
          <input
            key={index}
            ref={(element) => {
              otpInputRefs.current[index] = element;
            }}
            type='text'
            inputMode='numeric'
            maxLength={1}
            value={value}
            onChange={(event) => handleOtpChange(index, event.target.value)}
            onKeyDown={(event) => handleOtpKeyDown(index, event)}
            className={cn(
              'h-13 w-11 rounded-lg border bg-background text-center text-xl font-semibold outline-none transition-all',
              'focus:border-primary focus:ring-2 focus:ring-ring',
              verifyErrorMessage ? 'border-destructive' : '',
            )}
            disabled={isVerifyingOtp}
            autoFocus={index === 0}
          />
        ))}
      </div>

      <div className='mb-4 min-h-[20px]'>
        {verifyErrorMessage ? (
          <p className='text-center text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200'>
            {verifyErrorMessage}
          </p>
        ) : null}
      </div>

      <div className='space-y-3'>
        <Button
          className='w-full'
          onClick={verifyOtp}
          disabled={isVerifyingOtp || otpValues.join('').length !== 6}
        >
          {isVerifyingOtp && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {isVerifyingOtp ? '验证中...' : '验证'}
        </Button>
        <Button
          className='w-full'
          variant='outline'
          onClick={resendVerification}
          disabled={isResending || resendCooldownSeconds > 0}
        >
          {isResending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {isResending
            ? '发送中...'
            : resendCooldownSeconds > 0
              ? `${resendCooldownSeconds} 秒后重试`
              : '重新发送验证码'}
        </Button>
        <Button
          className='w-full'
          variant='ghost'
          onClick={() =>
            navigate({
              to: '/auth/login',
              search: {
                email,
                redirect: redirectTarget,
              },
            })
          }
        >
          返回登录
        </Button>
      </div>
    </>
  );
}

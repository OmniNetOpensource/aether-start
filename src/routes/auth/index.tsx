import { createSignal } from 'solid-js';
import { createFileRoute, redirect, useNavigate } from '@tanstack/solid-router';
import { Loader2 } from '@/frontend/design-system/icons';
import { authClient } from '@/frontend/auth/client';
import { LOCAL_DEV_EMAIL, LOCAL_DEV_NAME, LOCAL_DEV_OTP } from '@/shared/auth/local-dev-auth';
import { getSessionStateFn } from '@/rpc/auth';
import { Button } from '@/frontend/design-system/button';
import { Input } from '@/frontend/design-system/input';

export const Route = createFileRoute('/auth/')({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { redirect?: string; email?: string } = {};

    if (typeof search.redirect === 'string') {
      result.redirect = search.redirect;
    }

    if (typeof search.email === 'string') {
      result.email = search.email;
    }

    return result;
  },
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn();
    if (sessionState.isAuthenticated) {
      throw redirect({
        to: '/app',
      });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirectTarget = search().redirect;
  const target =
    redirectTarget && redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')
      ? redirectTarget
      : '/app';

  const [step, setStep] = createSignal<'email' | 'otp'>('email');
  const [email, setEmail] = createSignal(search().email ?? '');
  const [otp, setOtp] = createSignal('');
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = createSignal(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = createSignal(false);

  const sendOtp = async () => {
    const normalizedEmail = email().trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage('请输入邮箱');
      return;
    }

    setIsSendingOtp(true);
    setErrorMessage(null);

    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: normalizedEmail,
      type: 'sign-in',
    });

    setIsSendingOtp(false);

    if (error) {
      setErrorMessage(getAuthErrorMessage(error));
      return;
    }

    setEmail(normalizedEmail);
    setOtp('');
    setStep('otp');
  };

  const verifyOtp = async (nextOtp: string) => {
    if (isVerifyingOtp() || nextOtp.length !== 6) {
      return;
    }

    setIsVerifyingOtp(true);
    setErrorMessage(null);

    const currentEmail = email();
    const defaultName = currentEmail.includes('@')
      ? currentEmail.slice(0, currentEmail.indexOf('@'))
      : currentEmail;
    const { error } = await authClient.signIn.emailOtp({
      email: currentEmail,
      otp: nextOtp,
      name: defaultName || currentEmail,
    });

    if (error) {
      setOtp('');
      setErrorMessage(getAuthErrorMessage(error));
      setIsVerifyingOtp(false);
      return;
    }

    await navigate({ href: target, replace: true });
  };

  const signInLocalDev = async () => {
    setIsSendingOtp(true);
    setErrorMessage(null);

    const sendResult = await authClient.emailOtp.sendVerificationOtp({
      email: LOCAL_DEV_EMAIL,
      type: 'sign-in',
    });
    if (sendResult.error) {
      setErrorMessage(getAuthErrorMessage(sendResult.error));
      setIsSendingOtp(false);
      return;
    }

    const signInResult = await authClient.signIn.emailOtp({
      email: LOCAL_DEV_EMAIL,
      otp: LOCAL_DEV_OTP,
      name: LOCAL_DEV_NAME,
    });
    if (signInResult.error) {
      setErrorMessage(getAuthErrorMessage(signInResult.error));
      setIsSendingOtp(false);
      return;
    }

    await navigate({ href: target, replace: true });
  };

  return (
    <div class='w-full max-w-sm rounded-2xl border bg-surface p-8 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300'>
      <div class='mb-8 space-y-2 text-center'>
        <div class='mx-auto mb-6 flex h-12 w-12 rotate-3 cursor-default items-center justify-center rounded-xl bg-foreground text-background shadow-sm transition-transform hover:rotate-0 animate-in fade-in zoom-in-90 duration-300'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='24'
            height='24'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            stroke-width='2'
            stroke-linecap='round'
            stroke-linejoin='round'
          >
            <path d='m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z' />
          </svg>
        </div>
        <h1 class='text-2xl font-bold tracking-tight'>欢迎来到 Aether</h1>
        <p class='text-sm text-muted-foreground'>
          {step() === 'email' ? '输入邮箱继续' : `验证码已发送至 ${email()}`}
        </p>
      </div>
      <form
        class='space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          if (step() === 'email') {
            void sendOtp();
            return;
          }
          void verifyOtp(otp());
        }}
      >
        <Input
          type={step() === 'email' ? 'email' : 'text'}
          inputmode={step() === 'email' ? undefined : 'numeric'}
          autocomplete={step() === 'email' ? 'email' : 'one-time-code'}
          placeholder={step() === 'email' ? 'continue with email' : 'enter verification code'}
          value={step() === 'email' ? email() : otp()}
          maxlength={step() === 'otp' ? 6 : undefined}
          disabled={isSendingOtp() || isVerifyingOtp()}
          autofocus
          onChange={(event) => {
            setErrorMessage(null);

            if (step() === 'email') {
              setEmail(event.currentTarget.value);
              return;
            }

            const nextOtp = event.currentTarget.value.replace(/\D/g, '').slice(0, 6);
            setOtp(nextOtp);

            if (nextOtp.length === 6) {
              void verifyOtp(nextOtp);
            }
          }}
          class='h-12 text-center text-base'
        />

        <div class='min-h-[20px] text-center text-sm'>
          {errorMessage() ? <p class='text-destructive'>{errorMessage()}</p> : null}
        </div>

        <Button
          class='w-full'
          type='submit'
          disabled={isSendingOtp() || isVerifyingOtp() || (step() === 'otp' && otp().length !== 6)}
        >
          {isSendingOtp() || isVerifyingOtp() ? <Loader2 class='h-4 w-4 animate-spin' /> : null}
          {step() === 'email'
            ? isSendingOtp()
              ? 'Sending code...'
              : 'Continue'
            : isVerifyingOtp()
              ? 'Signing in...'
              : 'Continue'}
        </Button>
      </form>
      {import.meta.env.DEV && step() === 'email' ? (
        <Button
          class='mt-3 w-full'
          type='button'
          variant='outline'
          disabled={isSendingOtp() || isVerifyingOtp()}
          onClick={() => void signInLocalDev()}
        >
          {isSendingOtp() ? <Loader2 class='h-4 w-4 animate-spin' /> : null}
          本地开发登录
        </Button>
      ) : null}
      {step() === 'otp' ? (
        <div class='mt-4 flex items-center justify-between text-sm'>
          <button
            type='button'
            class='text-muted-foreground transition hover:text-foreground'
            onClick={() => {
              setStep('email');
              setOtp('');
              setErrorMessage(null);
            }}
            disabled={isSendingOtp() || isVerifyingOtp()}
          >
            Change email
          </button>
          <button
            type='button'
            class='text-primary transition hover:underline'
            onClick={() => {
              void sendOtp();
            }}
            disabled={isSendingOtp() || isVerifyingOtp()}
          >
            Resend code
          </button>
        </div>
      ) : null}
    </div>
  );
}

function getAuthErrorMessage(error: unknown) {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return '操作失败，请稍后再试';
  }

  const message = typeof error.message === 'string' ? error.message : '';

  if (message.includes('INVALID_EMAIL')) {
    return '请输入正确的邮箱';
  }

  if (message.includes('OTP_EXPIRED') || message.includes('expired')) {
    return '验证码已过期，请重新发送';
  }

  if (message.includes('INVALID_OTP') || message.includes('Invalid')) {
    return '验证码错误';
  }

  if (message.includes('TOO_MANY_ATTEMPTS')) {
    return '尝试次数过多，请重新发送验证码';
  }

  if (message.includes('rate') || message.includes('RATE_LIMIT')) {
    return '发送太频繁了，请稍后再试';
  }

  return message || '操作失败，请稍后再试';
}

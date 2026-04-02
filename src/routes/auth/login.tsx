import { useActionState, useEffect, useState } from 'react';
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
  getSafeRedirectTarget,
  getErrorMessage,
  isEmailNotVerifiedError,
} from './-_utils';

/**
 * 登录页（邮箱 + 密码）。
 *
 * 流程要点：
 * - 已登录用户访问本页会在 `beforeLoad` 被重定向到 `/app`，避免重复登录。
 * - 查询参数 `redirect` 经 `getSafeRedirectTarget` 校验后作为登录成功后的跳转地址。
 * - 从重置密码成功返回时 URL 会带 `reset=success`：先展示绿色提示条，再用 `replace` 清掉该参数，避免刷新重复提示。
 * - 若服务端返回「邮箱未验证」，则跳到 `/auth/register?verify=true&email=...`，走邮箱 OTP 验证。
 */
export const Route = createFileRoute('/auth/login')({
  validateSearch: validateAuthSearch,
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn();
    if (sessionState.isAuthenticated) {
      throw redirect({ to: '/app' });
    }
  },
  component: LoginPage,
});

type LoginFormState = {
  error: string | null;
};

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTarget, reset, email: initialEmail } = Route.useSearch();
  const target = getSafeRedirectTarget(redirectTarget);

  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [showResetSuccess] = useState(reset === 'success');

  const [formState, formAction, isPending] = useActionState(
    async (_prev: LoginFormState, formData: FormData): Promise<LoginFormState> => {
      const emailRaw = formData.get('email');
      const passwordRaw = formData.get('password');
      const normalizedEmail = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
      const passwordValue = typeof passwordRaw === 'string' ? passwordRaw : '';

      if (!normalizedEmail || !passwordValue) {
        return { error: '请输入邮箱和密码' };
      }

      const { error: signInError } = await authClient.signIn.email({
        email: normalizedEmail,
        password: passwordValue,
      });

      if (!signInError) {
        await navigate({ href: target, replace: true });
        return { error: null };
      }

      if (isEmailNotVerifiedError(signInError)) {
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
      }

      return { error: getErrorMessage(signInError, 'login') };
    },
    { error: null },
  );

  const errorMessage = formState.error;

  // 首屏已根据 `reset=success` 渲染提示；随后去掉该 query，避免用户复制链接或刷新时一直带 success。
  useEffect(() => {
    if (reset !== 'success') return;
    const qs = redirectTarget ? `?redirect=${encodeURIComponent(redirectTarget)}` : '';
    void navigate({ href: `/auth/login${qs}`, replace: true });
  }, [navigate, redirectTarget, reset]);

  return (
    <div className='w-full max-w-sm rounded-2xl border bg-surface p-8 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300'>
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
        <h1 className='text-2xl font-bold tracking-tight'>欢迎来到 Aether</h1>
        <p className='text-sm text-muted-foreground'>输入邮箱即可开启探索</p>
      </div>

      {showResetSuccess ? (
        <div className='mb-6 flex items-start gap-3 rounded-lg border border-emerald-500 bg-[#ecfdf5] px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-200'>
          <svg
            className='mt-0.5 h-5 w-5 shrink-0 text-emerald-500'
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='M20 6 9 17l-5-5' />
          </svg>
          <p className='text-sm text-success'>
            密码已重置，请使用新密码登录
          </p>
        </div>
      ) : null}

      <form className='space-y-5' action={formAction}>
        <div className='space-y-2'>
          <label className='text-sm font-medium text-secondary' htmlFor='email'>
            邮箱
          </label>
          <Input
            id='email'
            name='email'
            type='email'
            autoComplete='email'
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder='name@example.com'
            disabled={isPending}
            className={cn(
              errorMessage &&
                errorMessage.includes('邮箱') &&
                'border-destructive focus-visible:ring-destructive',
            )}
            required
          />
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <label className='text-sm font-medium text-secondary' htmlFor='password'>
              密码
            </label>
            <Link
              to='/auth/forgot-password'
              search={{ email: email.trim() || undefined }}
              className='text-xs font-medium text-primary hover:underline'
            >
              忘记密码？
            </Link>
          </div>
          <PasswordInput
            id='password'
            name='password'
            autoComplete='current-password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder='请输入密码'
            disabled={isPending}
            className={cn(
              errorMessage &&
                errorMessage.includes('密码') &&
                'border-destructive focus-visible:ring-destructive',
            )}
            required
          />
        </div>

        <div className='min-h-[20px]'>
          {errorMessage ? (
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
              {errorMessage}
            </p>
          ) : null}
        </div>

        <Button className='w-full relative overflow-hidden' type='submit' disabled={isPending}>
          {isPending ? (
            <span className='flex items-center gap-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span>处理中...</span>
            </span>
          ) : (
            '登录'
          )}
        </Button>
      </form>

      <p className='mt-6 text-center text-sm text-muted-foreground'>
        还没有账号？{' '}
        <Link
          to='/auth/register'
          search={{ redirect: redirectTarget }}
          className='font-medium text-primary hover:underline'
        >
          注册
        </Link>
      </p>
    </div>
  );
}

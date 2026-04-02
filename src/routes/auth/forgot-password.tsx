import { useActionState, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/features/auth/auth-client';
import { Button } from '@/shared/design-system/button';
import { Input } from '@/shared/design-system/input';
import { cn } from '@/shared/core/utils';

/** 将忘记密码接口错误映射为页面提示（与 reset 页类似，独立一份避免与登录注册混用）。 */
const getForgotPasswordErrorMessage = (error: unknown) => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message ?? '')
      : '';

  if (message.includes('INVALID_EMAIL')) {
    return '邮箱格式不正确';
  }

  if (message.includes('fetch failed')) {
    return '网络错误，请稍后重试';
  }

  return '发送失败，请稍后重试';
};

/**
 * 忘记密码：请求向邮箱发送重置链接。
 *
 * `requestPasswordReset` 的 `redirectTo` 指向 `/auth/reset-password`，邮件内链接需带 token 打开重置表单。
 * 成功后的文案采用「若该邮箱已注册则…」的表述，避免泄露邮箱是否注册。
 */
export const Route = createFileRoute('/auth/forgot-password')({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { email?: string } = {};
    if (typeof search.email === 'string') result.email = search.email;
    return result;
  },
  component: ForgotPasswordPage,
});

type ForgotFormState = { step: 'form'; error: string | null } | { step: 'success'; email: string };

function ForgotPasswordPage() {
  const { email: initialEmail } = Route.useSearch();
  const [email, setEmail] = useState(initialEmail ?? '');

  const [formState, formAction, isPending] = useActionState(
    async (_prev: ForgotFormState, formData: FormData): Promise<ForgotFormState> => {
      const emailRaw = formData.get('email');
      const normalizedEmail = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
      if (!normalizedEmail) {
        return { step: 'form', error: '请输入邮箱' };
      }

      try {
        const { error } = await authClient.requestPasswordReset({
          email: normalizedEmail,
          redirectTo: '/auth/reset-password',
        });

        if (error) {
          return { step: 'form', error: getForgotPasswordErrorMessage(error) };
        }

        return { step: 'success', email: normalizedEmail };
      } catch (error) {
        return { step: 'form', error: getForgotPasswordErrorMessage(error) };
      }
    },
    { step: 'form', error: null },
  );

  const isSubmitted = formState.step === 'success';
  const errorMessage = formState.step === 'form' ? formState.error : null;
  const submittedEmail = formState.step === 'success' ? formState.email : '';

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
            <path d='M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4' />
          </svg>
        </div>
        <h1 className='text-2xl font-bold tracking-tight'>找回密码</h1>
        <p className='text-sm text-muted-foreground'>
          {isSubmitted ? '重置邮件已发送' : '输入你的注册邮箱，我们会发送重置链接'}
        </p>
      </div>

      {isSubmitted ? (
        <div className='space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200'>
          <div className='flex items-start gap-3 rounded-lg border border-emerald-500 bg-[#ecfdf5] px-4 py-3'>
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
              如果该邮箱已注册，你将在几分钟内收到包含重置链接的邮件。
            </p>
          </div>
          <Button asChild className='w-full'>
            <Link to='/auth/login' search={{ email: submittedEmail || undefined }}>
              返回登录
            </Link>
          </Button>
        </div>
      ) : (
        <form
          className='space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200'
          action={formAction}
        >
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
              className={cn(errorMessage && 'border-destructive focus-visible:ring-destructive')}
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

          <div className='space-y-3'>
            <Button className='w-full relative overflow-hidden' type='submit' disabled={isPending}>
              {isPending ? (
                <span className='flex items-center gap-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span>发送中...</span>
                </span>
              ) : (
                '发送重置邮件'
              )}
            </Button>

            <Button className='w-full' variant='ghost' asChild>
              <Link to='/auth/login' search={{ email: email.trim() || undefined }}>
                返回登录
              </Link>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

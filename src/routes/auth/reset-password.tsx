import { SubmitEvent, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/features/auth/auth-client';
import { Button } from '@/shared/design-system/button';
import { PasswordInput } from '@/shared/design-system/password-input';
import { cn } from '@/shared/core/utils';

/** 服务端返回 token 无效 / 过期时，切换为「链接已失效」界面，引导用户重新走忘记密码。 */
const isInvalidTokenError = (error: unknown) => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  return message.includes('INVALID_TOKEN');
};

/** 重置密码提交失败时的用户可见说明（含密码长度、token、网络）。 */
const getResetPasswordErrorMessage = (error: unknown) => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  if (message.includes('INVALID_TOKEN')) {
    return '链接无效或已过期，请重新发起重置';
  }

  if (message.includes('PASSWORD_TOO_SHORT')) {
    return '密码长度不足，请至少输入 8 位';
  }

  if (message.includes('PASSWORD_TOO_LONG')) {
    return '密码过长，请少于 128 位';
  }

  if (message.includes('fetch failed')) {
    return '网络错误，请稍后重试';
  }

  return '重置失败，请稍后重试';
};

/**
 * 通过邮件链接打开：查询参数 `token` 为一次性重置凭证；`error=INVALID_TOKEN` 表示链接已失效。
 * 成功后跳转到登录页并带 `reset=success`，由登录页展示「请用新密码登录」。
 */
export const Route = createFileRoute('/auth/reset-password')({
  validateSearch: (search: Record<string, unknown>) => {
    const result: { token?: string; error?: string } = {};
    if (typeof search.token === 'string') result.token = search.token;
    if (typeof search.error === 'string') result.error = search.error;
    return result;
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token, error } = Route.useSearch();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 无 token 或邮件里已标记错误时，直接显示失效态，不展示密码表单。
  const [isTokenInvalid, setIsTokenInvalid] = useState(!token || error === 'INVALID_TOKEN');

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setIsTokenInvalid(true);
      setErrorMessage(null);
      return;
    }

    if (!newPassword || !confirmPassword) {
      setErrorMessage('请输入并确认新密码');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('两次输入的密码不一致');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { error: resetError } = await authClient.resetPassword({
        token,
        newPassword,
      });

      if (resetError) {
        if (isInvalidTokenError(resetError)) {
          setIsTokenInvalid(true);
          setErrorMessage(null);
          setIsSubmitting(false);
          return;
        }

        setErrorMessage(getResetPasswordErrorMessage(resetError));
        setIsSubmitting(false);
        return;
      }

      // 与 login 页约定：`reset=success` 首屏展示绿色提示后会被 effect 清掉 query。
      await navigate({
        href: '/auth/login?reset=success',
        replace: true,
      });
    } catch (resetError) {
      setErrorMessage(getResetPasswordErrorMessage(resetError));
      setIsSubmitting(false);
    }
  };

  return (
    <div className='w-full max-w-sm rounded-2xl border bg-(--surface-secondary) p-8 shadow-2xl backdrop-blur-xl ink-border animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300'>
      <div className='mb-8 space-y-2 text-center'>
        <div
          className={cn(
            'mx-auto mb-6 flex h-12 w-12 rotate-3 cursor-default items-center justify-center rounded-xl shadow-sm transition-transform hover:rotate-0 animate-in fade-in zoom-in-90 duration-300',
            isTokenInvalid
              ? 'bg-(--status-destructive-muted) text-(--status-destructive)'
              : 'bg-foreground text-background',
          )}
        >
          {isTokenInvalid ? (
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
              <circle cx='12' cy='12' r='10' />
              <line x1='12' x2='12' y1='8' y2='12' />
              <line x1='12' x2='12.01' y1='16' y2='16' />
            </svg>
          ) : (
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
              <rect width='18' height='11' x='3' y='11' rx='2' ry='2' />
              <path d='M7 11V7a5 5 0 0 1 10 0v4' />
            </svg>
          )}
        </div>
        <h1 className='text-2xl font-bold tracking-tight'>
          {isTokenInvalid ? '链接已失效' : '重置密码'}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {isTokenInvalid ? '请重新发起密码重置，获取最新链接' : '请输入你的新密码并确认'}
        </p>
      </div>

      {isTokenInvalid ? (
        <div className='space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200'>
          <Button asChild className='w-full'>
            <Link to='/auth/forgot-password'>重新发起重置</Link>
          </Button>
          <Button asChild className='w-full' variant='ghost'>
            <Link to='/auth/login'>返回登录</Link>
          </Button>
        </div>
      ) : (
        <form
          className='space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200'
          onSubmit={submit}
        >
          <div className='space-y-2'>
            <label className='text-sm font-medium text-(--text-secondary)' htmlFor='newPassword'>
              新密码
            </label>
            <PasswordInput
              id='newPassword'
              autoComplete='new-password'
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder='至少 8 位密码'
              disabled={isSubmitting}
              className={cn(
                errorMessage &&
                  'border-(--status-destructive) focus-visible:ring-(--status-destructive)',
              )}
              required
            />
          </div>

          <div className='space-y-2'>
            <label
              className='text-sm font-medium text-(--text-secondary)'
              htmlFor='confirmPassword'
            >
              确认新密码
            </label>
            <PasswordInput
              id='confirmPassword'
              autoComplete='new-password'
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder='请再次输入新密码'
              disabled={isSubmitting}
              className={cn(
                errorMessage &&
                  'border-(--status-destructive) focus-visible:ring-(--status-destructive)',
              )}
              required
            />
          </div>

          <div className='min-h-[20px]'>
            {errorMessage ? (
              <p className='flex items-center gap-1.5 text-sm text-(--status-destructive) animate-in fade-in slide-in-from-top-1 duration-200'>
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
            <Button
              className='w-full relative overflow-hidden'
              type='submit'
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className='flex items-center gap-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span>提交中...</span>
                </span>
              ) : (
                '确认重置'
              )}
            </Button>

            <Button className='w-full' variant='ghost' asChild>
              <Link to='/auth/login'>返回登录</Link>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

import { createElement, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionStateFnMock, navigateMock, signInEmailMock } = vi.hoisted(() => ({
  getSessionStateFnMock: vi.fn(),
  navigateMock: vi.fn(),
  signInEmailMock: vi.fn(),
}));

vi.mock('@/features/auth/session', () => ({
  getSessionStateFn: getSessionStateFnMock,
}));

vi.mock('@/features/auth/auth-client', () => ({
  authClient: {
    signIn: {
      email: signInEmailMock,
    },
  },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();

  return {
    ...actual,
    Link: ({
      children,
      className,
      to,
    }: {
      children?: ReactNode;
      className?: string;
      to?: string;
    }) => createElement('a', { className, href: typeof to === 'string' ? to : '#' }, children),
    useNavigate: () => navigateMock,
  };
});

import * as loginModule from '../login';

describe('login page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    navigateMock.mockReset();
    navigateMock.mockResolvedValue(undefined);
    signInEmailMock.mockReset();
    getSessionStateFnMock.mockReset();
  });

  const renderLoginPage = (search?: { email?: string; redirect?: string; reset?: 'success' }) => {
    vi.spyOn(loginModule.Route, 'useSearch').mockReturnValue(search ?? {});
    render(<loginModule.LoginPage />);
  };

  it('prefills the email and clears reset=success from the URL', async () => {
    renderLoginPage({
      email: 'prefill@example.com',
      redirect: '/app/c/123',
      reset: 'success',
    });

    expect(screen.getByText('密码已重置，请使用新密码登录')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('邮箱').value).toBe('prefill@example.com');

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        href: '/auth/login?redirect=%2Fapp%2Fc%2F123',
        replace: true,
      });
    });
  });

  it('shows a validation message when email or password is missing', async () => {
    renderLoginPage();
    const form = screen.getByRole('button', { name: '登录' }).closest('form');
    if (!form) {
      throw new Error('Login form not found');
    }
    fireEvent.submit(form);

    expect(signInEmailMock).not.toHaveBeenCalled();
    expect(await screen.findByText('请输入邮箱和密码')).toBeTruthy();
  });

  it('normalizes the email and redirects after a successful login', async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({ error: null });

    renderLoginPage({ redirect: '/app/c/abc' });

    await user.type(screen.getByLabelText('邮箱'), ' USER@Example.com ');
    await user.type(screen.getByLabelText('密码'), 'secret-123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(signInEmailMock).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret-123',
      });
      expect(navigateMock).toHaveBeenCalledWith({
        href: '/app/c/abc',
        replace: true,
      });
    });
  });

  it('falls back to /app/ when the redirect target is not safe', async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({ error: null });

    renderLoginPage({ redirect: '/auth/register' });

    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret-123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        href: '/app/',
        replace: true,
      });
    });
  });

  it('routes unverified users into the register verify flow', async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({
      error: {
        status: 403,
        message: 'EMAIL_NOT_VERIFIED',
      },
    });

    renderLoginPage({ redirect: '/app/c/verify-me' });

    await user.type(screen.getByLabelText('邮箱'), 'User@Example.com');
    await user.type(screen.getByLabelText('密码'), 'secret-123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/auth/register',
        search: {
          email: 'user@example.com',
          redirect: '/app/c/verify-me',
          verify: 'true',
        },
        replace: true,
      });
    });
  });

  it('shows the mapped error message when login fails', async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({
      error: {
        status: 401,
        message: 'INVALID_EMAIL_OR_PASSWORD',
      },
    });

    renderLoginPage();

    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.type(screen.getByLabelText('密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('邮箱或密码错误，或账号不存在')).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

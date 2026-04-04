import { createElement, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSessionStateFnMock,
  navigateMock,
  sendVerificationOtpMock,
  signUpEmailMock,
  verifyEmailMock,
} = vi.hoisted(() => ({
  getSessionStateFnMock: vi.fn(),
  navigateMock: vi.fn(),
  sendVerificationOtpMock: vi.fn(),
  signUpEmailMock: vi.fn(),
  verifyEmailMock: vi.fn(),
}));

vi.mock('@/features/auth/session', () => ({
  getSessionStateFn: getSessionStateFnMock,
}));

vi.mock('@/features/auth/auth-client', () => ({
  authClient: {
    signUp: {
      email: signUpEmailMock,
    },
    emailOtp: {
      sendVerificationOtp: sendVerificationOtpMock,
      verifyEmail: verifyEmailMock,
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

import * as registerModule from '../register';

describe('register page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    getSessionStateFnMock.mockReset();
    navigateMock.mockReset();
    navigateMock.mockResolvedValue(undefined);
    sendVerificationOtpMock.mockReset();
    signUpEmailMock.mockReset();
    verifyEmailMock.mockReset();
  });

  const renderRegisterPage = (search?: { email?: string; redirect?: string; verify?: 'true' }) => {
    vi.spyOn(registerModule.Route, 'useSearch').mockReturnValue(search ?? {});
    render(<registerModule.RegisterPage />);
  };

  const fillRegisterForm = async (
    user: ReturnType<typeof userEvent.setup>,
    values: {
      email?: string;
      password?: string;
      confirmPassword?: string;
    },
  ) => {
    if (values.email) {
      await user.type(screen.getByLabelText('邮箱'), values.email);
    }

    if (values.password) {
      await user.type(screen.getByLabelText('密码'), values.password);
    }

    if (values.confirmPassword) {
      await user.type(screen.getByLabelText('确认密码'), values.confirmPassword);
    }
  };

  it('shows a validation message when the required fields are missing', async () => {
    renderRegisterPage();
    const form = screen.getByRole('button', { name: '注册' }).closest('form');
    if (!form) {
      throw new Error('Register form not found');
    }
    fireEvent.submit(form);

    expect(signUpEmailMock).not.toHaveBeenCalled();
    expect(await screen.findByText('请输入邮箱和两次密码')).toBeTruthy();
  });

  it('shows a validation message when the passwords do not match', async () => {
    const user = userEvent.setup();

    renderRegisterPage();
    await fillRegisterForm(user, {
      email: 'user@example.com',
      password: 'secret-123',
      confirmPassword: 'different-456',
    });
    await user.click(screen.getByRole('button', { name: '注册' }));

    expect(signUpEmailMock).not.toHaveBeenCalled();
    expect(screen.getByText('两次输入的密码不一致')).toBeTruthy();
  });

  it('requires an email before sending a verification code', async () => {
    const user = userEvent.setup();

    renderRegisterPage();
    await user.click(screen.getByRole('button', { name: '发送验证码' }));

    expect(sendVerificationOtpMock).not.toHaveBeenCalled();
    expect(screen.getByText('请输入邮箱')).toBeTruthy();
  });

  it('sends the verification code with a normalized email and starts a cooldown', async () => {
    sendVerificationOtpMock.mockResolvedValue({ error: null });

    renderRegisterPage();
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: ' USER@Example.com ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    await waitFor(() => {
      expect(sendVerificationOtpMock).toHaveBeenCalledWith({
        email: 'user@example.com',
        type: 'email-verification',
      });
    });
    expect(screen.getByRole('button', { name: '30 秒后重试' })).toBeTruthy();
  });

  it('registers the user and navigates into verify mode', async () => {
    const user = userEvent.setup();
    signUpEmailMock.mockResolvedValue({ error: null });

    renderRegisterPage({ redirect: '/app/c/new-chat' });
    await fillRegisterForm(user, {
      email: ' USER@Example.com ',
      password: 'secret-123',
      confirmPassword: 'secret-123',
    });
    await user.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(signUpEmailMock).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret-123',
        name: 'user',
      });
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/auth/register',
        search: {
          email: 'user@example.com',
          redirect: '/app/c/new-chat',
          verify: 'true',
        },
        replace: true,
      });
    });
  });

  it('shows the mapped error when signup fails', async () => {
    const user = userEvent.setup();
    signUpEmailMock.mockResolvedValue({
      error: {
        status: 422,
        message: 'USER_ALREADY_EXISTS',
      },
    });

    renderRegisterPage();
    await fillRegisterForm(user, {
      email: 'user@example.com',
      password: 'secret-123',
      confirmPassword: 'secret-123',
    });
    await user.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByText('该邮箱已注册，请直接登录')).toBeTruthy();
  });

  it('verifies a complete otp and redirects to the safe target', async () => {
    const user = userEvent.setup();
    verifyEmailMock.mockResolvedValue({ error: null });

    renderRegisterPage({
      email: 'user@example.com',
      redirect: '/app/c/verified',
      verify: 'true',
    });

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');
    await user.type(inputs[0], '1');
    expect(document.activeElement).toBe(inputs[1]);
    await user.type(inputs[1], '2');
    await user.type(inputs[2], '3');
    await user.type(inputs[3], '4');
    await user.type(inputs[4], '5');
    await user.type(inputs[5], '6');
    await user.click(screen.getByRole('button', { name: '验证' }));

    await waitFor(() => {
      expect(verifyEmailMock).toHaveBeenCalledWith({
        email: 'user@example.com',
        otp: '123456',
      });
      expect(navigateMock).toHaveBeenCalledWith({
        href: '/app/c/verified',
        replace: true,
      });
    });
  });

  it('shows an invalid otp error and clears all otp inputs', async () => {
    const user = userEvent.setup();
    verifyEmailMock.mockResolvedValue({
      error: {
        message: 'INVALID_OTP',
      },
    });

    renderRegisterPage({
      email: 'user@example.com',
      verify: 'true',
    });

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');
    for (const [index, value] of ['1', '2', '3', '4', '5', '6'].entries()) {
      await user.type(inputs[index], value);
    }
    await user.click(screen.getByRole('button', { name: '验证' }));

    expect(await screen.findByText('验证码错误，请重新输入')).toBeTruthy();

    for (const input of screen.getAllByRole<HTMLInputElement>('textbox')) {
      expect(input.value).toBe('');
    }
  });

  it('resends the verification email, clears the otp, and starts a cooldown', async () => {
    sendVerificationOtpMock.mockResolvedValue({ error: null });

    renderRegisterPage({
      email: 'user@example.com',
      verify: 'true',
    });

    const inputs = screen.getAllByRole<HTMLInputElement>('textbox');
    fireEvent.change(inputs[0], { target: { value: '1' } });
    fireEvent.change(inputs[1], { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '重新发送验证码' }));

    await waitFor(() => {
      expect(sendVerificationOtpMock).toHaveBeenCalledWith({
        email: 'user@example.com',
        type: 'email-verification',
      });
    });

    for (const input of screen.getAllByRole<HTMLInputElement>('textbox')) {
      expect(input.value).toBe('');
    }
    expect(screen.getByRole('button', { name: '30 秒后重试' })).toBeTruthy();
  });
});

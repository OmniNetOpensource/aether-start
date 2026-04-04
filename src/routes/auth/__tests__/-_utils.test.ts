import { describe, expect, it } from 'vitest';
import {
  getDefaultName,
  getErrorMessage,
  getSafeRedirectTarget,
  isEmailNotVerifiedError,
  validateAuthSearch,
} from '../-_utils';

describe('auth route utils', () => {
  it('only keeps supported auth search params', () => {
    expect(
      validateAuthSearch({
        redirect: '/app/c/123',
        reset: 'success',
        email: 'user@example.com',
        unused: 'ignored',
      }),
    ).toEqual({
      redirect: '/app/c/123',
      reset: 'success',
      email: 'user@example.com',
    });
  });

  it('blocks unsafe redirect targets', () => {
    expect(getSafeRedirectTarget(undefined)).toBe('/app/');
    expect(getSafeRedirectTarget('https://evil.example')).toBe('/app/');
    expect(getSafeRedirectTarget('/auth/login')).toBe('/app/');
    expect(getSafeRedirectTarget('/app/c/123')).toBe('/app/c/123');
  });

  it('maps login errors into readable messages', () => {
    expect(getErrorMessage({ status: 401, message: 'INVALID_EMAIL_OR_PASSWORD' }, 'login')).toBe(
      '邮箱或密码错误，或账号不存在',
    );
    expect(getErrorMessage({ message: 'INVALID_EMAIL' }, 'login')).toBe('邮箱格式不正确');
    expect(getErrorMessage({ message: 'fetch failed' }, 'login')).toBe('网络错误，请稍后重试');
    expect(getErrorMessage({ message: 'unexpected' }, 'login')).toBe('登录失败，请稍后重试');
  });

  it('maps register errors into readable messages', () => {
    expect(getErrorMessage({ status: 422, message: 'USER_ALREADY_EXISTS' }, 'register')).toBe(
      '该邮箱已注册，请直接登录',
    );
    expect(getErrorMessage({ message: 'PASSWORD_TOO_SHORT' }, 'register')).toBe('密码长度不足');
    expect(getErrorMessage({ message: 'PASSWORD_TOO_LONG' }, 'register')).toBe('密码过长');
    expect(getErrorMessage({ message: 'unexpected' }, 'register')).toBe('注册失败，请稍后重试');
  });

  it('recognizes email-not-verified responses', () => {
    expect(isEmailNotVerifiedError({ status: 403, message: 'EMAIL_NOT_VERIFIED' })).toBe(true);
    expect(isEmailNotVerifiedError({ message: 'EMAIL_NOT_VERIFIED' })).toBe(true);
    expect(isEmailNotVerifiedError({ status: 401, message: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      false,
    );
  });

  it('derives the default display name from the email prefix', () => {
    expect(getDefaultName('alice@example.com')).toBe('alice');
    expect(getDefaultName(' user@example.com ')).toBe('user');
  });
});

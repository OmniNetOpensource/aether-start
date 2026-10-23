import { useRef, useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Loader2 } from '@/frontend/design-system/icons';
import { authClient } from '@/frontend/auth/client';
import { LOCAL_DEV_EMAIL, LOCAL_DEV_NAME, LOCAL_DEV_OTP } from '@/shared/auth/local-dev-auth';
import { getSessionStateFn } from '@/rpc/auth';

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
  const redirectTarget = search.redirect;
  const target =
    redirectTarget && redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')
      ? redirectTarget
      : '/app';

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState(search.email ?? '');
  const [otp, setOtp] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const verifyingOtp = useRef(false);
  const [attentionPart, setAttentionPart] = useState<'Q' | 'K' | 'V'>('Q');

  const sendOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
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
    if (verifyingOtp.current || nextOtp.length !== 6) {
      return;
    }

    verifyingOtp.current = true;
    setIsVerifyingOtp(true);
    setErrorMessage(null);

    const currentEmail = email;
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
      verifyingOtp.current = false;
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
    <div className='frame'>
      <section className='login-panel' aria-label='登录 Aether'>
        <a className='brand' href='/' aria-label='Aether 首页'>
          <span className='brand-mark'>
            <AetherMark />
          </span>
          <span>aether</span>
        </a>
        <div className='form-area'>
          <div className='eyebrow'>FOLLOW YOUR CURIOSITY</div>
          <h1>{step === 'email' ? '从好奇，到真正理解。' : '查看你的收件箱。'}</h1>
          <p className='intro'>
            {step === 'email' ? (
              <>
                你的学习 Agent，陪你把问题研究透。
                <br />
                从资料到图解，把知识学明白。
              </>
            ) : (
              <>
                验证码已发送至
                <br />
                {email}
              </>
            )}
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (step === 'email') {
                await sendOtp();
                return;
              }
              await verifyOtp(otp);
            }}
          >
            <label className='field'>
              <span className='field-label'>{step === 'email' ? '邮箱地址' : '6 位验证码'}</span>
              <span className='input-row'>
                <input
                  type={step === 'email' ? 'email' : 'text'}
                  inputMode={step === 'email' ? 'email' : 'numeric'}
                  autoComplete={step === 'email' ? 'email' : 'one-time-code'}
                  placeholder={step === 'email' ? 'you@example.com' : '000000'}
                  value={step === 'email' ? email : otp}
                  maxLength={step === 'otp' ? 6 : undefined}
                  pattern={step === 'otp' ? '[0-9]{6}' : undefined}
                  required
                  aria-invalid={errorMessage ? true : undefined}
                  aria-describedby='auth-field-hint auth-error'
                  disabled={isSendingOtp || isVerifyingOtp}
                  autoFocus
                  className={step === 'otp' ? 'otp' : undefined}
                  onChange={async (event) => {
                    setErrorMessage(null);
                    if (step === 'email') {
                      setEmail(event.currentTarget.value);
                      return;
                    }
                    const nextOtp = event.currentTarget.value.replace(/\D/g, '').slice(0, 6);
                    setOtp(nextOtp);
                    if (nextOtp.length === 6) await verifyOtp(nextOtp);
                  }}
                />
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.4'
                  aria-hidden='true'
                >
                  <rect x='3' y='5' width='18' height='14' rx='2' />
                  <path d='m3 6 9 7 9-7' />
                </svg>
              </span>
            </label>
            <div className='field-foot'>
              <span className='secure' id='auth-field-hint'>
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  aria-hidden='true'
                >
                  <rect x='5' y='10' width='14' height='11' rx='2' />
                  <path d='M8 10V7a4 4 0 0 1 8 0v3' />
                </svg>
                {step === 'email' ? '使用验证码登录，无需密码' : '输入邮件中的 6 位验证码'}
              </span>
              {step === 'otp' ? (
                <button
                  className='text-button'
                  type='button'
                  disabled={isSendingOtp || isVerifyingOtp}
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                    setErrorMessage(null);
                  }}
                >
                  更换邮箱
                </button>
              ) : null}
            </div>
            <p className='error' id='auth-error' aria-live='polite'>
              {errorMessage}
            </p>
            <button
              className='submit'
              type='submit'
              disabled={isSendingOtp || isVerifyingOtp || (step === 'otp' && otp.length !== 6)}
            >
              <span>
                {isSendingOtp
                  ? '正在发送验证码…'
                  : isVerifyingOtp
                    ? '正在验证…'
                    : step === 'email'
                      ? '开始学习'
                      : '验证并登录'}
              </span>
              {isSendingOtp || isVerifyingOtp ? (
                <Loader2 className='auth-loading' />
              ) : (
                <svg
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <path d='M4 12h15m-6-6 6 6-6 6' />
                </svg>
              )}
            </button>
          </form>
          <p className='form-note'>
            {step === 'email' ? (
              '首次登录将自动创建账号。'
            ) : (
              <button
                className='text-button'
                type='button'
                disabled={isSendingOtp || isVerifyingOtp}
                onClick={async () => {
                  await sendOtp();
                }}
              >
                重新发送验证码
              </button>
            )}
          </p>
          {import.meta.env.DEV && step === 'email' ? (
            <button
              className='text-button local-dev-login'
              type='button'
              disabled={isSendingOtp || isVerifyingOtp}
              onClick={async () => {
                await signInLocalDev();
              }}
            >
              本地开发登录
            </button>
          ) : null}
        </div>
        <footer className='form-footer'>
          <span className='footer-status'>让每一份好奇，都有更深的理解</span>
          <span className='footer-year'>© 2026 Aether</span>
        </footer>
      </section>
      <aside className='showcase' aria-label='Aether 产品示例'>
        <div className='showcase-top'>
          <span className='small-label'>RESEARCH. VISUALIZE. UNDERSTAND.</span>
          <span className='edition'>YOUR LEARNING AGENT</span>
        </div>
        <div className='hero-copy'>
          <h2>
            深入研究，
            <br />
            让知识<span>看得见。</span>
          </h2>
          <p>
            用 Deep Research 研究问题，用 HTML 图解呈现知识。
            <br />
            不只得到答案，更理解它如何发生。
          </p>
        </div>
        <div className='card-stage'>
          <div className='possibility-card'>
            <small>GO DEEPER. SEE CLEARER.</small>
            <h3>
              深入研究。
              <br />
              直观理解。
            </h3>
            <div className='orbit'></div>
            <AetherMark className='orbit-star' />
          </div>
          <div className='thread-card'>
            <div className='thread-head'>
              <span className='conversation-label'>
                <AetherMark /> 一次深入学习
              </span>
              <span className='demo-tag'>学习示例</span>
              <span className='window-dots'>
                <i></i>
                <i></i>
                <i></i>
              </span>
            </div>
            <p className='prompt'>
              <span>为什么 Transformer 需要注意力机制？</span>
            </p>
            <div className='assistant'>
              <span className='assistant-icon'>
                <AetherMark />
              </span>
              <div className='response'>
                <p>
                  <strong>从原理出发，把问题讲清楚。</strong>
                  <br />
                  检索资料，拆解概念，再用交互图解展开。
                </p>
                <div className='response-line'></div>
                <div className='response-line short'></div>
                <div className='response-chips'>
                  <span>资料检索</span>
                  <span>概念拆解</span>
                  <span>生成图解 ↗</span>
                </div>
              </div>
            </div>
          </div>
          <div className='render-card'>
            <div className='render-head'>
              <span>
                <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5'>
                  <path d='m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16' />
                </svg>
                注意力机制，拆开来看
              </span>
              <span className='live-dot'></span>
            </div>
            <div className='concept-demo'>
              <div className='concept-tokens' role='group' aria-label='了解注意力机制中的 Q、K、V'>
                <button
                  type='button'
                  aria-pressed={attentionPart === 'Q'}
                  onClick={() => setAttentionPart('Q')}
                >
                  Q
                </button>
                <button
                  type='button'
                  aria-pressed={attentionPart === 'K'}
                  onClick={() => setAttentionPart('K')}
                >
                  K
                </button>
                <button
                  type='button'
                  aria-pressed={attentionPart === 'V'}
                  onClick={() => setAttentionPart('V')}
                >
                  V
                </button>
              </div>
              <p className='concept-note' aria-live='polite'>
                {
                  {
                    Q: 'Q · 当前词想要寻找的信息',
                    K: 'K · 每个词用于匹配的特征',
                    V: 'V · 每个词实际提供的信息',
                  }[attentionPart]
                }
              </p>
            </div>
            <div className='chart-footer'>
              <span>HTML 交互图解 · 示例</span>
              <span>点击 Q / K / V ↗</span>
            </div>
          </div>
        </div>
        <div className='feature-list'>
          <span>
            <AetherMark /> 深度研究
          </span>
          <span>↗ 知识拆解</span>
          <span>⌘ HTML 可视化</span>
        </div>
      </aside>
    </div>
  );
}

function AetherMark({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 32 32' className={className} aria-hidden='true'>
      <path
        d='M15.3 17.1C8.1 15.9 2.2 10.6 5.2 7.3S13 10.1 15.3 17.1C12 10.3 11.3 2.6 15.5 3.2S18.6 11.4 15.3 17.1C18.6 11.2 25.3 7.3 27 11S21.9 17.6 15.3 17.1C21.7 17.9 27.6 23.4 24.6 26S17.2 23 15.3 17.1C15.1 23.6 10.5 29.2 7.9 26.1S9.5 18.7 15.3 17.1'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='m25.7 3.5 1-1.3M28 5l1.6-.3'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.3'
        strokeLinecap='round'
      />
    </svg>
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

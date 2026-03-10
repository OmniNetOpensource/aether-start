import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // 开启 tunnel 绕过广告拦截器
    tunnel: '/api/sentry',
    environment: import.meta.env.DEV ? 'development' : 'production',
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: true,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
  })
}

export { Sentry }

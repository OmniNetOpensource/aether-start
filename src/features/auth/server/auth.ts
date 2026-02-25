import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { drizzle } from 'drizzle-orm/d1'
import { Resend } from 'resend'
import { getServerEnv } from '@/server/env'
import * as authSchema from './auth.schema'
import { hashPassword, verifyPassword } from './crypto'

const isBetterAuthCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((arg) => arg.includes('better-auth'))

const requireEnvValue = (
  value: string | undefined,
  key: string,
  fallbackForCli?: string,
) => {
  if (!value && isBetterAuthCli && fallbackForCli) {
    return fallbackForCli
  }

  if (!value) {
    throw new Error(`Missing server env: ${key}`)
  }

  return value
}

const toOrigin = (value: string) => {
  try {
    return new URL(value).origin
  } catch {
    return value
  }
}

const createPlaceholderD1Database = (): D1Database =>
  ({
    prepare() {
      throw new Error('DB binding is unavailable in Better Auth CLI mode')
    },
    dump() {
      return Promise.reject(new Error('DB binding is unavailable in Better Auth CLI mode'))
    },
    batch() {
      return Promise.reject(new Error('DB binding is unavailable in Better Auth CLI mode'))
    },
    exec() {
      return Promise.reject(new Error('DB binding is unavailable in Better Auth CLI mode'))
    },
  }) as unknown as D1Database

const resolveD1Database = () => {
  const env = getServerEnv()
  if (env.DB) {
    return env.DB
  }

  if (isBetterAuthCli) {
    return createPlaceholderD1Database()
  }

  throw new Error('Missing worker binding: DB')
}

const createAuth = () => {
  const serverEnv = getServerEnv()

  const baseURL = requireEnvValue(
    serverEnv.BETTER_AUTH_URL,
    'BETTER_AUTH_URL',
    'http://localhost:3000',
  )
  const secret = requireEnvValue(
    serverEnv.BETTER_AUTH_SECRET,
    'BETTER_AUTH_SECRET',
    '4f2f7f59ad6d435c9f5f2ce7f0f6f2d3',
  )
  const db = drizzle(resolveD1Database(), { schema: authSchema })

  return betterAuth({
    baseURL,
    basePath: '/api/auth',
    secret,
    trustedOrigins: [toOrigin(baseURL)],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        const resendApiKey = serverEnv.RESEND_API_KEY
        if (!resendApiKey) {
          console.warn('RESEND_API_KEY not configured, skipping reset password email')
          return
        }

        const resend = new Resend(resendApiKey)
        await resend.emails.send({
          from: 'noreply@mail.forkicks.fun',
          to: user.email,
          subject: 'Aether 重置密码',
          html: `<p>我们收到了重置密码请求。</p><p>请点击以下链接设置新密码：</p><p><a href="${url}">${url}</a></p><p>链接 1 小时内有效。</p>`,
        })
      },
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const resendApiKey = serverEnv.RESEND_API_KEY
        if (!resendApiKey) {
          console.warn('RESEND_API_KEY not configured, skipping verification email')
          return
        }
        const resend = new Resend(resendApiKey)
        await resend.emails.send({
          from: 'noreply@mail.forkicks.fun',
          to: user.email,
          subject: 'Aether 邮箱验证',
          html: `<p>请点击以下链接验证你的邮箱：</p><p><a href="${url}">${url}</a></p>`,
        })
      },
    },
    plugins: [tanstackStartCookies()],
  })
}

export type AuthInstance = ReturnType<typeof createAuth>

let _auth: AuthInstance
export const getAuth = () => {
  if (!_auth) _auth = createAuth()
  return _auth
}

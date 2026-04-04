import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Resend } from 'resend';
import { getServerEnv } from '@/shared/worker/env';
import * as authSchema from './auth.schema';

const isBetterAuthCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((arg) => arg.includes('better-auth'));

const requireEnvValue = (value: string | undefined, key: string, fallbackForCli?: string) => {
  if (!value && isBetterAuthCli && fallbackForCli) {
    return fallbackForCli;
  }

  if (!value) {
    throw new Error(`Missing server env: ${key}`);
  }

  return value;
};

const toOrigin = (value: string) => {
  if (!URL.canParse(value)) {
    return value;
  }

  return new URL(value).origin;
};

const trustedOriginsForBaseURL = (value: string) => {
  const primary = toOrigin(value);
  const origins = [primary];
  if (!URL.canParse(primary)) {
    return origins;
  }

  const u = new URL(primary);
  if (!u.port) {
    return origins;
  }
  if (u.hostname === 'localhost') {
    origins.push(`${u.protocol}//127.0.0.1:${u.port}`);
  } else if (u.hostname === '127.0.0.1') {
    origins.push(`${u.protocol}//localhost:${u.port}`);
  }
  return origins;
};

const mergeTrustedOrigins = (baseURL: string, extrasCsv: string | undefined) => {
  const set = new Set<string>();
  for (const o of trustedOriginsForBaseURL(baseURL)) {
    set.add(o);
  }
  if (!extrasCsv) {
    return [...set];
  }
  for (const part of extrasCsv.split(',')) {
    const piece = part.trim();
    if (!piece) {
      continue;
    }
    for (const o of trustedOriginsForBaseURL(piece)) {
      set.add(o);
    }
  }
  return [...set];
};

const getRequestIp = (headers: Headers | undefined) => {
  if (!headers) {
    return null;
  }

  for (const key of ['cf-connecting-ip', 'x-forwarded-for']) {
    const value = headers.get(key)?.split(',')[0]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
};

const createPlaceholderD1Database = (): D1Database =>
  ({
    prepare() {
      throw new Error('DB binding is unavailable in Better Auth CLI mode');
    },
    dump() {
      return Promise.reject(new Error('DB binding is unavailable in Better Auth CLI mode'));
    },
    batch() {
      return Promise.reject(new Error('DB binding is unavailable in Better Auth CLI mode'));
    },
    exec() {
      return Promise.reject(new Error('DB binding is unavailable in Better Auth CLI mode'));
    },
  }) as unknown as D1Database;

const resolveD1Database = () => {
  const env = getServerEnv();
  if (env.DB) {
    return env.DB;
  }

  if (isBetterAuthCli) {
    return createPlaceholderD1Database();
  }

  throw new Error('Missing worker binding: DB');
};

const createAuth = () => {
  const serverEnv = getServerEnv();

  const baseURL = requireEnvValue(
    serverEnv.BETTER_AUTH_URL,
    'BETTER_AUTH_URL',
    'http://localhost:3000',
  );
  const secret = requireEnvValue(
    serverEnv.BETTER_AUTH_SECRET,
    'BETTER_AUTH_SECRET',
    '4f2f7f59ad6d435c9f5f2ce7f0f6f2d3',
  );
  const db = drizzle(resolveD1Database(), { schema: authSchema });

  return betterAuth({
    baseURL,
    basePath: '/api/auth',
    secret,
    trustedOrigins: mergeTrustedOrigins(baseURL, serverEnv.BETTER_AUTH_TRUSTED_ORIGINS),
    user: {
      additionalFields: {
        registrationIp: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
        lastLoginAt: {
          type: 'date',
          required: false,
          input: false,
          returned: false,
        },
        lastLoginIp: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/email-otp/send-verification-otp': {
          window: 30,
          max: 1,
        },
      },
    },
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: authSchema,
    }),
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const data = { ...user };
            delete data.image;
            data.registrationIp = getRequestIp(context?.request?.headers);
            return { data };
          },
        },
        update: {
          before: async (user) => {
            const data = { ...user };
            delete data.image;
            return { data };
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            const ip =
              'ipAddress' in session && typeof session.ipAddress === 'string'
                ? session.ipAddress
                : null;
            await db
              .update(authSchema.user)
              .set({ lastLoginAt: new Date(), lastLoginIp: ip })
              .where(eq(authSchema.user.id, session.userId));
          },
        },
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
    },
    plugins: [
      tanstackStartCookies(),
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          const resendApiKey = serverEnv.RESEND_API_KEY;
          if (!resendApiKey) {
            console.warn('RESEND_API_KEY not configured, skipping OTP email');
            return;
          }

          console.log('[sendVerificationOTP]', { type, email });

          if (type === 'forget-password') {
            return;
          }

          const resend = new Resend(resendApiKey);
          const subjectMap = {
            'email-verification': 'Aether 邮箱验证',
            'sign-in': 'Aether 登录验证',
            'change-email': 'Aether 更换邮箱',
          } as const;
          const titleMap = {
            'email-verification': '验证你的邮箱',
            'sign-in': '登录验证',
            'change-email': '更换邮箱',
          } as const;
          const title = titleMap[type];
          const font =
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,sans-serif";

          const sendResult = await resend.emails.send({
            from: 'noreply@mail.forkicks.fun',
            to: email,
            subject: subjectMap[type],
            html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background-color:#0d0d0d;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0d0d0d;">
<tr><td align="center" style="padding:48px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:440px;">
<tr>
<td style="border-top:3px solid #5e6ad2;border-radius:12px;background-color:#141414;border-left:1px solid #262626;border-right:1px solid #262626;border-bottom:1px solid #262626;overflow:hidden;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:36px 32px 28px;font-family:${font};">
<p style="margin:0 0 20px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#8a8f98;">Aether</p>
<h1 style="margin:0 0 24px;font-size:20px;font-weight:600;line-height:1.3;color:#f7f8f8;letter-spacing:-0.02em;">${title}</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#8a8f98;">请使用以下验证码完成操作。</p>
<p style="margin:0;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:36px;font-weight:600;letter-spacing:10px;line-height:1.2;color:#f7f8f8;">${otp}</p>
</td></tr>
<tr><td style="padding:0 32px 32px;font-family:${font};">
<p style="margin:0;font-size:13px;line-height:1.55;color:#6b7280;border-top:1px solid #262626;padding-top:24px;">验证码 5 分钟内有效。如非本人操作，请忽略此邮件。</p>
</td></tr>
</table>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`,
          });
          if (sendResult.error) {
            throw new Error(sendResult.error.message, { cause: sendResult.error });
          }
        },
      }),
    ],
  });
};

export type AuthInstance = ReturnType<typeof createAuth>;

let _auth: AuthInstance;
export const getAuth = () => {
  if (!_auth) _auth = createAuth();
  return _auth;
};

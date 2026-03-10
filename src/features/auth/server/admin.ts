import { requireSession } from '@/server/functions/auth/session'
import { getServerEnv } from '@/server/env'

const parseAllowlist = (value: string | undefined): Set<string> => {
  if (!value || typeof value !== 'string') {
    return new Set()
  }
  return new Set(
    value
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

let cachedAllowlist: Set<string> | null = null

const getAdminEmailAllowlist = (): Set<string> => {
  if (cachedAllowlist === null) {
    const env = getServerEnv()
    const raw = (env as { ADMIN_EMAIL_ALLOWLIST?: string }).ADMIN_EMAIL_ALLOWLIST
    cachedAllowlist = parseAllowlist(raw)
  }
  return cachedAllowlist
}

export const requireAdminSession = async () => {
  const session = await requireSession()
  const allowlist = getAdminEmailAllowlist()
  const email = session.user.email?.trim().toLowerCase()
  if (!email || !allowlist.has(email)) {
    throw new Response('Forbidden', { status: 403 })
  }
  return session
}

export const isAdminEmail = (email: string | undefined): boolean => {
  if (!email) return false
  return getAdminEmailAllowlist().has(email.trim().toLowerCase())
}

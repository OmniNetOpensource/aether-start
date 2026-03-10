import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

export type Theme = 'light' | 'dark'

export const getTheme = createServerFn().handler((): Theme => {
  const request = getRequest()
  const cookieHeader = request.headers.get('cookie') ?? ''
  const match = cookieHeader.match(/(?:^|; )theme=([^;]+)/)
  const value = match ? decodeURIComponent(match[1]) : null
  return value === 'dark' ? 'dark' : 'light'
})

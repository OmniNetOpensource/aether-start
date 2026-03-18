import { createServerFn } from '@tanstack/react-start'

export type Theme = 'light' | 'dark'

export const getTheme = createServerFn().handler((): Theme => 'light')

import { createServerFn } from '@tanstack/react-start';

export type Theme = 'light' | 'dark' | 'nord' | 'morandi';

export const THEMES: readonly Theme[] = ['light', 'dark', 'nord', 'morandi'];

export const THEME_LABELS: Record<Theme, string> = {
  light: '浅色',
  dark: '深色',
  nord: 'Nord',
  morandi: 'Morandi',
};

export const getTheme = createServerFn().handler((): Theme => 'light');

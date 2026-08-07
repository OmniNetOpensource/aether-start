import type { ThemeDefinition } from '@/frontend/themes/contract';
import './theme.css';

export const whitelinesTheme = {
  id: 'whitelines',
  label: 'Whitelines',
  colorScheme: 'light',
} satisfies ThemeDefinition;

export const blacklinesTheme = {
  id: 'blacklines',
  label: 'Blacklines',
  colorScheme: 'dark',
} satisfies ThemeDefinition;

export const whitelinesThemes = [whitelinesTheme, blacklinesTheme];

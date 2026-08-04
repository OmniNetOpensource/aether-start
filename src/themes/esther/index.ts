import type { ThemeDefinition } from '@/themes/contract';
import './theme.css';

export const estherPaperTheme = {
  id: 'esther-paper',
  label: 'Esther Paper',
  colorScheme: 'light',
} satisfies ThemeDefinition;

export const estherMidnightTheme = {
  id: 'esther-midnight',
  label: 'Esther Midnight',
  colorScheme: 'dark',
} satisfies ThemeDefinition;

export const estherThemes = [estherPaperTheme, estherMidnightTheme];

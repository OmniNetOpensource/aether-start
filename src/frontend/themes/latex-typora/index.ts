import type { ThemeDefinition } from '@/frontend/themes/contract';
import './theme.css';

export const latexPaperTheme = {
  id: 'latex-paper',
  label: 'LaTeX Paper',
  colorScheme: 'light',
} satisfies ThemeDefinition;

export const latexDarkTheme = {
  id: 'latex-dark',
  label: 'LaTeX Dark',
  colorScheme: 'dark',
} satisfies ThemeDefinition;

export const latexTyporaThemes = [latexPaperTheme, latexDarkTheme];

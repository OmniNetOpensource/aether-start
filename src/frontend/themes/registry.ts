import { estherMidnightTheme, estherPaperTheme, estherThemes } from '@/frontend/themes/esther';
import { latexTyporaThemes } from '@/frontend/themes/latex-typora';
import { whitelinesThemes } from '@/frontend/themes/whitelines';

export const themes = [...estherThemes, ...whitelinesThemes, ...latexTyporaThemes];

export type Theme = (typeof themes)[number];

export const defaultTheme = {
  light: estherPaperTheme,
  dark: estherMidnightTheme,
};

export const findTheme = (id: string | null) => themes.find((theme) => theme.id === id);

export const themeInitScript = `(function(){var themes=${JSON.stringify(
  Object.fromEntries(themes.map((theme) => [theme.id, theme.colorScheme])),
)};var t=localStorage.getItem('theme');var s=t&&themes[t];if(!s){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'${defaultTheme.dark.id}':'${defaultTheme.light.id}';s=themes[t];}document.documentElement.dataset.theme=t;document.documentElement.dataset.colorScheme=s;document.documentElement.classList.toggle('dark',s==='dark');})();`;

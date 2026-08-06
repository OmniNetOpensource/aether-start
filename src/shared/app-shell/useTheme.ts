import { createEffect, createSignal } from 'solid-js';
import { useMountEffect } from '@/shared/app-shell/useMountEffect';
import { defaultTheme, findTheme, type Theme } from '@/themes/registry';

const THEME_STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.colorScheme = theme.colorScheme;
  document.documentElement.classList.toggle('dark', theme.colorScheme === 'dark');
};

const getInitialTheme = (): Theme => {
  const stored = findTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  if (stored) return stored;

  return window.matchMedia(DARK_QUERY).matches ? defaultTheme.dark : defaultTheme.light;
};

export function useTheme() {
  const [theme, setThemeState] = createSignal<Theme>(getInitialTheme());

  createEffect(theme, applyTheme);

  useMountEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = findTheme(event.newValue);
      if (!next) return;
      setThemeState(next);
      applyTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });

  const setTheme = (next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next.id);
    applyTheme(next);
  };

  return { theme, setTheme };
}

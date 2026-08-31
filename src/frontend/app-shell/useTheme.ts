import { useEffect, useState } from 'react';
import { defaultTheme, findTheme, type Theme } from '@/frontend/themes/registry';

const THEME_STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const applyTheme = (theme: Theme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.colorScheme = theme.colorScheme;
  document.documentElement.classList.toggle('dark', theme.colorScheme === 'dark');
};

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return defaultTheme.light;

  const stored = findTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  if (stored) return stored;

  return window.matchMedia(DARK_QUERY).matches ? defaultTheme.dark : defaultTheme.light;
};

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = findTheme(event.newValue);
      if (!next) return;
      setThemeState(next);
      applyTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, next.id);
    }
    applyTheme(next);
  };

  return { theme, setTheme };
}

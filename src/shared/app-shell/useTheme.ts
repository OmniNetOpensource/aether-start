import { useEffect, useState } from 'react';
import { useMountEffect } from '@/shared/app-shell/useMountEffect';
import { type Theme, THEMES } from '@/shared/app-shell/theme';

const THEME_STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const DARK_THEMES: ReadonlySet<Theme> = new Set(['dark', 'nord']);

const isValidTheme = (value: string | null): value is Theme => THEMES.includes(value as Theme);

const applyThemeClass = (theme: Theme) => {
  if (typeof document === 'undefined') return;
  const cl = document.documentElement.classList;
  cl.remove('dark', 'nord', 'morandi');
  if (DARK_THEMES.has(theme)) cl.add('dark');
  if (theme !== 'light' && theme !== 'dark') cl.add(theme);
};

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light';

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isValidTheme(stored)) return stored;

  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
};

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  useMountEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (!isValidTheme(event.newValue)) return;
      setThemeState(event.newValue);
      applyThemeClass(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });

  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
    applyThemeClass(next);
  };

  return { theme, setTheme } as const;
}

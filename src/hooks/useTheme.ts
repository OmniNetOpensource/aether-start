import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const applyHtmlClass = (theme: Theme) => {
  if (typeof document === "undefined") return;
  const classList = document.documentElement.classList;
  if (theme === "dark") {
    classList.add("dark");
  } else {
    classList.remove("dark");
  }
};

const setThemeCookie = (theme: Theme) => {
  if (typeof document === "undefined") return;
  document.cookie = `theme=${theme}; path=/; max-age=31536000`;
};

const hasCookieTheme = (): boolean => {
  if (typeof document === "undefined") return false;
  return /(?:^|; )theme=/.test(document.cookie);
};

const getSystemTheme = (): Theme => {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
};

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return getSystemTheme();
};

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    // 迁移：仅有 localStorage 没有 cookie 的老用户，补写 cookie
    if (!hasCookieTheme()) {
      setThemeCookie(theme);
    }
    // 确保 HTML class 与客户端实际主题一致
    // （处理服务端因无 cookie 而默认渲染 light、但用户实际偏好 dark 的情况）
    applyHtmlClass(theme);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
    setThemeCookie(next);

    applyHtmlClass(next);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  return { theme, toggleTheme } as const;
}

"use client";

import { useState } from "react";

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

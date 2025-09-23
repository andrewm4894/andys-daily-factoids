"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const THEME_STORAGE_KEY = "factoids-ui-theme";

export const THEME_OPTIONS = [
  { value: "light", label: "Daylight", icon: "☀️", mode: "light" },
  { value: "dark", label: "Midnight", icon: "🌙", mode: "dark" },
  { value: "aurora", label: "Aurora", icon: "🌌", mode: "dark" },
  { value: "matrix", label: "Matrix", icon: "🖥️", mode: "dark" },
  { value: "rainbow", label: "Rainbow", icon: "🌈", mode: "light" },
] as const;

export type ThemeName = (typeof THEME_OPTIONS)[number]["value"];
type ThemeMode = (typeof THEME_OPTIONS)[number]["mode"];

const THEME_MODE_MAP = THEME_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.mode;
    return acc;
  },
  {} as Record<ThemeName, ThemeMode>,
);

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  options: typeof THEME_OPTIONS;
  isReady: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemeName(value: string | null): value is ThemeName {
  if (!value) return false;
  return THEME_OPTIONS.some((option) => option.value === value);
}

function applyThemeToDocument(theme: ThemeName, mode: ThemeMode) {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty("color-scheme", mode);

  if (mode === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("light");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(stored)) {
      setThemeState(stored);
      setIsReady(true);
      return;
    }

    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    setThemeState(prefersDark ? "dark" : "light");
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || typeof window === "undefined") {
      return;
    }

    const mode = THEME_MODE_MAP[theme];
    applyThemeToDocument(theme, mode);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isReady, theme]);

  const setTheme = useCallback((nextTheme: ThemeName) => {
    setThemeState(nextTheme);
  }, []);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, options: THEME_OPTIONS, isReady }),
    [theme, setTheme, isReady],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

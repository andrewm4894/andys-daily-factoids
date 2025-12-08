"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
  {} as Record<ThemeName, ThemeMode>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const themeQuery = searchParams?.get("theme") ?? null;

  // Initialize theme from URL query, localStorage, or system preference
  // This is a valid initialization pattern that must run once on mount
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isThemeName(themeQuery)) {
      setThemeState(themeQuery);
      setIsReady(true);
      return;
    }

    if (themeQuery) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("theme");
        const cleanedSearch = url.searchParams.toString();
        router.replace(
          `${url.pathname}${cleanedSearch ? `?${cleanedSearch}` : ""}${url.hash}`,
          { scroll: false }
        );
      } catch (error) {
        console.error("Failed to clean invalid theme query parameter", error);
      }
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(stored)) {
      setThemeState(stored);
      setIsReady(true);
      return;
    }

    const prefersDark =
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    setThemeState(prefersDark ? "dark" : "light");
    setIsReady(true);
  }, [router, themeQuery]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isReady || typeof window === "undefined") {
      return;
    }

    const mode = THEME_MODE_MAP[theme];
    applyThemeToDocument(theme, mode);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isReady, theme]);

  const setTheme = useCallback(
    (nextTheme: ThemeName) => {
      setThemeState(nextTheme);

      if (typeof window === "undefined") {
        return;
      }

      try {
        const url = new URL(window.location.href);
        const existing = url.searchParams.get("theme");
        if (existing === nextTheme) {
          return;
        }
        url.searchParams.set("theme", nextTheme);
        const nextSearch = url.searchParams.toString();
        const nextHash = url.hash;
        router.replace(
          `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash}`,
          { scroll: false }
        );
      } catch (error) {
        console.error("Failed to update theme query parameter", error);
      }
    },
    [router]
  );

  const contextValue = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, options: THEME_OPTIONS, isReady }),
    [theme, setTheme, isReady]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

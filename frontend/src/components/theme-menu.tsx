"use client";

import { useEffect, useRef, useState } from "react";

import { THEME_OPTIONS, ThemeName, useTheme } from "@/components/theme-provider";

export function ThemeMenu() {
  const { theme, setTheme, options, isReady } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const current = options.find((option) => option.value === theme) ?? THEME_OPTIONS[0];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelection = (value: ThemeName) => {
    setTheme(value);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-card-border)] bg-[var(--surface-card)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-secondary)] shadow-sm transition-colors hover:border-[color:var(--surface-card-border-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-outline)] disabled:cursor-not-allowed disabled:opacity-70"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={!isReady}
      >
        <span aria-hidden className="text-base leading-none">
          {current.icon}
        </span>
        <span>{current.label}</span>
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-[color:var(--surface-card-border)] bg-[var(--surface-card)] text-sm shadow-lg"
        >
          {options.map((option) => {
            const isActive = option.value === theme;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => handleSelection(option.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-[color:var(--surface-muted)] text-[color:var(--text-primary)]"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
                }`}
              >
                <span aria-hidden className="text-base leading-none">
                  {option.icon}
                </span>
                <span className="flex-1">{option.label}</span>
                {isActive && (
                  <span aria-hidden className="text-sm text-[color:var(--accent)]">
                    ●
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

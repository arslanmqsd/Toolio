"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "toolio-theme";

// Runs in <head> before paint so a saved light preference doesn't flash dark.
export const themeInitScript = `try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function ThemeToggle() {
  // Unknown until mounted: the server can't see the saved preference.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode etc.) — theme still applies for this visit.
    }
    setTheme(next);
  }

  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  const Icon = theme === "light" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={theme === null}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--text-muted)] hover:bg-[color:color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[color:var(--text)] disabled:opacity-0"
    >
      <Icon aria-hidden className="h-[18px] w-[18px]" />
    </button>
  );
}

/**
 * Category themes. A category overrides the design tokens in app/globals.css by picking a preset
 * (structure and type) and adding its own tokens (usually the accent). lib/category-theme-css.ts
 * turns these into CSS scoped to [data-category="<id>"].
 */

/** Tokens a theme may override, without the leading "--". Each must be defined on :root in globals.css. */
export const THEME_TOKENS = [
  "accent",
  "accent-2",
  "accent-text",
  "surface",
  "surface-raised",
  "text",
  "text-muted",
  "border",
  "font-display",
  "font-output",
  "numeric",
  "shell-max",
  "shell-py",
  "shell-columns",
  "panel-gap",
  "panel-radius",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type TokenMap = Partial<Record<ThemeToken, string>>;

export interface CategoryTheme {
  /** Starting point: see themePresets. Defaults to "precise". */
  preset?: ThemePreset;
  /** Tokens for both color schemes. */
  tokens?: TokenMap;
  /** Tokens for the dark scheme only (the default scheme). */
  dark?: TokenMap;
  /** Tokens for the light scheme only. */
  light?: TokenMap;
}

export type ThemePreset = "precise" | "ledger" | "canvas" | "editorial";

export const themePresets: Record<ThemePreset, Omit<CategoryTheme, "preset">> = {
  /** Precise input, precise output: the :root system as is. Developer, Fix My File. */
  precise: {},
  /** Precise, plus figures that line up in tables, sums and charts. Data, Calculators, Freelancer. */
  ledger: {
    tokens: { numeric: "tabular-nums" },
  },
  /** Visual work: a wider page, and results described in the UI face rather than as code. */
  canvas: {
    tokens: { "font-output": "var(--font-ui)", "shell-max": "80rem" },
  },
  /** Reflection rather than execution: dusk color, a humanist serif, one narrow column, more room. Think Better. */
  editorial: {
    tokens: {
      "font-display": "var(--font-literata), 'Literata', Georgia, serif",
      "font-output": "var(--font-display)",
      "shell-max": "48rem",
      "shell-py": "4rem",
      "shell-columns": "1",
      "panel-gap": "2rem",
      "panel-radius": "1rem",
    },
    dark: {
      accent: "#6A58B0",
      "accent-2": "#79B8D9",
      surface: "#17151F",
      "surface-raised": "#211E2C",
      text: "#ECE8F2",
      "text-muted": "#A59FB4",
      "accent-text": "#B9AAF0",
      border: "color-mix(in srgb, var(--accent) 30%, transparent)",
    },
    light: {
      accent: "#5B4A9E",
      "accent-2": "#2F7FA6",
      surface: "#F6F3FA",
      "surface-raised": "#FFFFFF",
      text: "#211B2E",
      "text-muted": "#625A73",
      "accent-text": "var(--accent)",
      border: "color-mix(in srgb, var(--accent) 22%, transparent)",
    },
  },
};

/**
 * An accent for a category: `fill` behind white text (at least 4.5:1, and 4.5:1 as text on the light
 * background), `text` for text and icons on the dark background.
 */
export function accent(fill: string, text: string): Pick<CategoryTheme, "tokens" | "dark" | "light"> {
  return { tokens: { accent: fill }, dark: { "accent-text": text }, light: { "accent-text": "var(--accent)" } };
}

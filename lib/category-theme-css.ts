import { categories, type Category } from "@/registry";
import { themePresets, THEME_TOKENS, type CategoryTheme, type TokenMap } from "@/registry/themes";

// Values end up inside a <style> tag, so refuse anything that could close a declaration or the tag.
const UNSAFE_VALUE = /[;{}<>]/;

function customProperties(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, value]) => {
      if (UNSAFE_VALUE.test(value)) throw new Error(`Theme token "${name}" has an unsafe value: ${value}`);
      return `--${name}:${value};`;
    })
    .join("");
}

function declarations(tokens: TokenMap): string {
  for (const name of Object.keys(tokens)) {
    if (!(THEME_TOKENS as readonly string[]).includes(name)) throw new Error(`Unknown theme token "${name}".`);
  }
  return customProperties(tokens as Record<string, string>);
}

/** A theme with its preset merged in: category tokens win over the preset's. */
export function resolveTheme(theme: CategoryTheme = {}): Required<Omit<CategoryTheme, "preset">> {
  const preset = themePresets[theme.preset ?? "precise"];
  return {
    tokens: { ...preset.tokens, ...theme.tokens },
    dark: { ...preset.dark, ...theme.dark },
    light: { ...preset.light, ...theme.light },
  };
}

/**
 * CSS for one category. Dark is the default scheme, so dark tokens sit in the base rule; in light mode
 * any dark-only token falls back to the shared value, or inherits the :root light value.
 */
export function categoryCss(id: string, theme?: CategoryTheme): string {
  const { tokens, dark, light } = resolveTheme(theme);
  const selector = `[data-category="${id}"]`;
  const base = declarations({ ...tokens, ...dark });

  const lightTokens: TokenMap = {};
  for (const name of Object.keys(dark) as (keyof TokenMap)[]) {
    lightTokens[name] = tokens[name] ?? "inherit";
  }
  Object.assign(lightTokens, light);
  const lightDecls = declarations(lightTokens);

  return [
    base && `${selector}{${base}}`,
    lightDecls && `:root[data-theme="light"] ${selector}{${lightDecls}}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** CSS custom property holding a category's tint, e.g. `--tint-developer`. */
export function tintVar(id: string): string {
  return `--tint-${id}`;
}

/** A category's tint as a CSS color, usable anywhere on the site (it is set on :root). */
export function tintColor(id: string): string {
  return `var(${tintVar(id)})`;
}

/**
 * A category's accent for icons, per scheme: the dark scheme's text accent, the light scheme's fill.
 * Categories that keep the default accent use the brand green.
 */
export function categoryTint(theme?: CategoryTheme): { dark: string; light: string } {
  const { tokens, dark, light } = resolveTheme(theme);
  return {
    dark: dark["accent-text"] ?? tokens["accent-text"] ?? "var(--brand-accent-text)",
    light: light.accent ?? tokens.accent ?? "var(--brand-accent)",
  };
}

/**
 * Icon tints for every category, on :root so they work outside the category's own pages (home,
 * search, catalog).
 */
export function categoryTintsCss(list: Category[] = Object.values(categories)): string {
  const tints = list.map((category) => [tintVar(category.id).slice(2), categoryTint(category.theme)] as const);
  const dark = customProperties(Object.fromEntries(tints.map(([name, tint]) => [name, tint.dark])));
  const light = customProperties(Object.fromEntries(tints.map(([name, tint]) => [name, tint.light])));
  return `:root{${dark}}\n:root[data-theme="light"]{${light}}`;
}

/** Theme CSS for every category in the registry: icon tints plus each category's scoped tokens. */
export function categoryThemesCss(list: Category[] = Object.values(categories)): string {
  return [categoryTintsCss(list), ...list.map((category) => categoryCss(category.id, category.theme))]
    .filter(Boolean)
    .join("\n");
}

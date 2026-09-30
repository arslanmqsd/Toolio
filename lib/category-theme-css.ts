import { categories, type Category } from "@/registry";
import { themePresets, THEME_TOKENS, type CategoryTheme, type TokenMap } from "@/registry/themes";

// Values end up inside a <style> tag, so refuse anything that could close a declaration or the tag.
const UNSAFE_VALUE = /[;{}<>]/;

function declarations(tokens: TokenMap): string {
  return Object.entries(tokens)
    .map(([name, value]) => {
      if (!(THEME_TOKENS as readonly string[]).includes(name)) throw new Error(`Unknown theme token "${name}".`);
      if (UNSAFE_VALUE.test(value)) throw new Error(`Theme token "${name}" has an unsafe value: ${value}`);
      return `--${name}:${value};`;
    })
    .join("");
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

/** Theme CSS for every category in the registry. */
export function categoryThemesCss(list: Category[] = Object.values(categories)): string {
  return list
    .map((category) => categoryCss(category.id, category.theme))
    .filter(Boolean)
    .join("\n");
}

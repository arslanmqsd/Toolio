import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categories } from "@/registry";
import { themePresets, THEME_TOKENS } from "@/registry/themes";
import { categoryCss, categoryThemesCss, categoryTint, categoryTintsCss, resolveTheme } from "./category-theme-css";

describe("category themes", () => {
  it("only uses tokens that globals.css defines on :root", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    for (const token of THEME_TOKENS) expect(root, token).toContain(`--${token}:`);
  });

  it("emits valid CSS for every category and preset", () => {
    expect(() => categoryThemesCss()).not.toThrow();
    for (const preset of Object.keys(themePresets)) {
      expect(() => categoryCss("x", { preset: preset as keyof typeof themePresets })).not.toThrow();
    }
  });

  it("gives every category a theme", () => {
    for (const category of Object.values(categories)) expect(category.theme, category.id).toBeDefined();
  });

  it("lets category tokens win over the preset", () => {
    expect(resolveTheme({ preset: "canvas", tokens: { "shell-max": "60rem" } }).tokens["shell-max"]).toBe("60rem");
  });

  it("scopes dark tokens to the base rule and light tokens to the light scheme", () => {
    const css = categoryCss("demo", { dark: { accent: "#111111", text: "#EEEEEE" }, light: { accent: "#222222" } });
    expect(css).toContain('[data-category="demo"]{--accent:#111111;--text:#EEEEEE;}');
    // A dark-only token must not leak into light mode.
    expect(css).toContain(':root[data-theme="light"] [data-category="demo"]{--accent:#222222;--text:inherit;}');
  });

  it("emits nothing for the default theme", () => {
    expect(categoryCss("demo", { preset: "precise" })).toBe("");
  });

  it("rejects unknown tokens and values that could break out of the style tag", () => {
    expect(() => categoryCss("demo", { tokens: { accent: "red;} body{display:none" } })).toThrow(/unsafe/);
    expect(() => categoryCss("demo", { tokens: { accent: "</style><script>" } })).toThrow(/unsafe/);
    expect(() => categoryCss("demo", { tokens: { nope: "1" } as never })).toThrow(/Unknown/);
  });

  it("derives icon tints from each category's accent, falling back to the brand", () => {
    expect(categoryTint({ preset: "precise" })).toEqual({ dark: "var(--brand-accent-text)", light: "var(--brand-accent)" });
    expect(categoryTint({ tokens: { accent: "#256F6F" }, dark: { "accent-text": "#6BC1C1" } })).toEqual({
      dark: "#6BC1C1",
      light: "#256F6F",
    });
    expect(categoryTint({ preset: "editorial" })).toEqual({ dark: "#B9AAF0", light: "#5B4A9E" });
  });

  it("sets a tint on :root for every category", () => {
    const css = categoryTintsCss();
    for (const id of Object.keys(categories)) {
      expect(css.match(new RegExp(`--tint-${id}:`, "g")), id).toHaveLength(2);
    }
  });
});

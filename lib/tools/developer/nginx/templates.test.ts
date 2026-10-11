import { describe, expect, it } from "vitest";
import { generateFull, generateSite } from "./generate";
import { sequentialIds } from "./model";
import { LOCATION_PRESETS, TEMPLATES } from "./templates";
import { validateConfig } from "./validate";

describe("templates", () => {
  it.each(TEMPLATES.map((t) => [t.label, t] as const))("%s has no errors or warnings, only notes", (_, t) => {
    const issues = validateConfig(t.create(sequentialIds()));
    expect(issues.filter((i) => i.level !== "info")).toEqual([]);
  });

  it.each(TEMPLATES.map((t) => [t.label, t] as const))("%s generates balanced blocks with every directive ended", (_, t) => {
    for (const text of [generateSite(t.create(sequentialIds())), generateFull(t.create(sequentialIds()))]) {
      expect((text.match(/{/g) ?? []).length).toBe((text.match(/}/g) ?? []).length);
      for (const line of text.split("\n").map((l) => l.trim())) {
        if (line && !line.startsWith("#")) expect(line, line).toMatch(/[;{}]$/);
      }
    }
  });

  it("gives the same output for the same template", () => {
    for (const t of TEMPLATES) expect(generateSite(t.create(sequentialIds()))).toBe(generateSite(t.create(sequentialIds("other"))));
  });

  it("has location presets that are valid in a basic config", () => {
    const base = TEMPLATES[0].create(sequentialIds());
    for (const p of LOCATION_PRESETS) {
      const config = { ...base, locations: [p.create(sequentialIds("p"))] };
      expect(validateConfig(config).filter((i) => i.level === "error"), p.id).toEqual([]);
    }
  });
});

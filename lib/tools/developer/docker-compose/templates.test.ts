import { describe, expect, it } from "vitest";
import { generateCompose, generateEnvExample } from "./generate";
import { sequentialIds } from "./model";
import { PRESETS, TEMPLATES, uniqueName } from "./templates";
import { validateProject } from "./validate";

describe("templates", () => {
  it.each(TEMPLATES.map((t) => [t.label, t] as const))("%s passes every check and keeps secrets out of compose.yaml", (_, template) => {
    const project = { name: "", services: template.create(sequentialIds()) };
    expect(validateProject(project)).toEqual([]);
    const yaml = generateCompose(project);
    expect(yaml).not.toMatch(/change-me/);
    expect(yaml).not.toMatch(/^version:/m);
    const secrets = new Set(project.services.flatMap((s) => s.environment.filter((v) => v.secret).map((v) => v.key)));
    expect(generateEnvExample(project).keys).toEqual([...secrets]);
  });

  it("gives the same ids every time, so server and client render alike", () => {
    expect(TEMPLATES[0].create(sequentialIds())).toEqual(TEMPLATES[0].create(sequentialIds()));
  });

  it.each(PRESETS.map((p) => [p.label, p] as const))("preset %s is valid on its own, once named and given an image", (_, preset) => {
    const service = preset.create(sequentialIds(), preset.name);
    if (preset.id === "blank") service.image = "busybox:1.36";
    const issues = validateProject({ name: "", services: [service] }).filter((i) => i.level === "error");
    expect(issues).toEqual([]);
  });
});

describe("uniqueName", () => {
  it("numbers a name that's taken", () => {
    expect(uniqueName("db", [])).toBe("db");
    expect(uniqueName("db", ["db"])).toBe("db-2");
    expect(uniqueName("db", ["db", "db-2"])).toBe("db-3");
  });
});

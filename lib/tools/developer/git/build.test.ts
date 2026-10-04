import { describe, expect, it } from "vitest";
import {
  commandText,
  defaultValues,
  fieldCombinations,
  highestDanger,
  maxDanger,
  placeholderToken,
  resolveTask,
} from "./build";
import { part, refField, revisionField, step, when } from "./catalog/helpers";
import type { FieldValues, Task } from "./types";

const fixture: Task = {
  id: "fixture",
  category: "branches",
  title: "Fixture",
  summary: "For tests.",
  synonyms: [],
  fields: [
    refField("name", "Name", { placeholder: "branch-name" }),
    revisionField("start", "Start", { optional: true }),
    { id: "force", label: "Force", kind: "checkbox", default: false },
    {
      id: "mode",
      label: "Mode",
      kind: "select",
      default: "a",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    },
    revisionField("extra", "Extra", { placeholder: "extra", shownWhen: (v) => v.mode === "b" }),
  ],
  build: (a) => [
    step(
      a.flag("force") ? "destructive" : "safe",
      [
        part("git x", "X."),
        part(a.q("name"), "Name."),
        ...when(a.has("start"), part(a.q("start"), "Start.")),
        ...when(a.choice("mode") === "b", part(a.q("extra"), "Extra.")),
      ],
      a.flag("force") ? { warning: "W." } : {},
    ),
  ],
};

const resolve = (values: FieldValues) => resolveTask(fixture, { ...defaultValues(fixture), ...values });

describe("resolveTask", () => {
  it("builds the command when every required field is valid", () => {
    const r = resolve({ name: "feature/a" });
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(commandText(r.steps)).toBe("git x feature/a");
  });

  it("trims pasted whitespace", () => {
    const r = resolve({ name: "  feature/a  ", start: " main " });
    expect(r.status === "ready" && commandText(r.steps)).toBe("git x feature/a main");
  });

  it("quotes values", () => {
    const r = resolve({ name: "a'b" });
    expect(r.status === "ready" && commandText(r.steps)).toBe("git x 'a'\\''b'");
  });

  it("shows placeholders for empty required fields", () => {
    const r = resolve({});
    expect(r.status).toBe("incomplete");
    if (r.status !== "incomplete") return;
    expect(r.missing.map((f) => f.id)).toEqual(["name"]);
    expect(commandText(r.steps)).toBe("git x <branch-name>");
  });

  it("reports invalid values, including a leading dash", () => {
    expect(resolve({ name: "-f" })).toEqual({ status: "invalid", errors: { name: "Can't start with -." } });
    expect(resolve({ name: "a b", start: "x y" })).toEqual({
      status: "invalid",
      errors: { name: "Can't contain spaces.", start: "Can't contain spaces." },
    });
  });

  it("ignores hidden fields", () => {
    expect(resolve({ name: "x", extra: "a b" }).status).toBe("ready");
    const r = resolve({ name: "x", mode: "b" });
    expect(r.status === "incomplete" && r.missing.map((f) => f.id)).toEqual(["extra"]);
  });
});

describe("danger", () => {
  it("is the highest of the steps, safe for none", () => {
    expect(highestDanger([])).toBe("safe");
    expect(highestDanger([step("safe", []), step("caution", [])])).toBe("caution");
  });

  it("covers every checkbox and select combination", () => {
    expect(fieldCombinations(fixture)).toHaveLength(4);
    expect(maxDanger(fixture)).toBe("destructive");
  });
});

describe("placeholderToken", () => {
  it("falls back to the field id", () => {
    expect(placeholderToken({ id: "name", label: "Name", kind: "text", default: "" })).toBe("<name>");
  });
});

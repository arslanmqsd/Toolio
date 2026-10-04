import { describe, expect, it } from "vitest";
import { fieldCombinations, resolveTask } from "../build";
import type { FieldValues, Task } from "../types";
import { GIT_CATEGORIES, getTask, QUICK_START, TASKS } from ".";

/** Defaults, with "sample" in every empty text field so every task can build. */
function sampleValues(task: Task, combo: FieldValues): FieldValues {
  const values = { ...combo };
  for (const field of task.fields) if (values[field.id] === "") values[field.id] = "sample";
  return values;
}

describe("task catalog", () => {
  it("has unique kebab-case ids", () => {
    const ids = TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("lists tasks in category order, with every category used", () => {
    const order = GIT_CATEGORIES.map((c) => c.id);
    const seen = TASKS.map((t) => order.indexOf(t.category));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    for (const category of order) expect(TASKS.some((t) => t.category === category), category).toBe(true);
  });

  it("points only at tasks that exist", () => {
    for (const id of QUICK_START) expect(getTask(id), id).toBeDefined();
    for (const task of TASKS) {
      for (const id of task.related ?? []) expect(getTask(id), `${task.id} related ${id}`).toBeDefined();
    }
  });

  it("has unique field ids, and selects whose default is an option", () => {
    for (const task of TASKS) {
      const ids = task.fields.map((f) => f.id);
      expect(new Set(ids).size, task.id).toBe(ids.length);
      for (const field of task.fields.filter((f) => f.kind === "select")) {
        expect(field.options?.map((o) => o.value), `${task.id}.${field.id}`).toContain(field.default);
      }
    }
  });

  it("builds every option combination into explained, safe-to-paste steps", () => {
    for (const task of TASKS) {
      for (const combo of fieldCombinations(task)) {
        const r = resolveTask(task, sampleValues(task, combo));
        expect(r.status, `${task.id} ${JSON.stringify(combo)}`).toBe("ready");
        if (r.status !== "ready") continue;
        expect(r.steps.length, task.id).toBeGreaterThan(0);
        for (const step of r.steps) {
          for (const p of step.parts) {
            expect(p.text.trim(), task.id).not.toBe("");
            expect(p.explain.trim(), `${task.id} "${p.text}"`).not.toBe("");
            expect(p.text, task.id).not.toContain("HEAD^");
          }
          if (step.danger === "destructive") expect(step.warning, `${task.id} warning`).toBeTruthy();
          if (step.saferAlternative) expect(getTask(step.saferAlternative.taskId), `${task.id} safer`).toBeDefined();
        }
      }
    }
  });
});

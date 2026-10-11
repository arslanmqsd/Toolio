import { describe, expect, it } from "vitest";
import { fieldCombinations, presetValues, resolveTask } from "@/lib/command-builder/build";
import type { FieldValues, Task } from "../types";
import { DOCKER_CATEGORIES, getTask, QUICK_START, TASKS } from ".";

/** Defaults, with a valid sample in every empty required text field so every task can build. */
const SAMPLES: Record<string, string> = { image: "nginx:1.27", source: "nginx:1.27", target: "me/nginx:1.27", tags: "app:1.0", subnet: "10.0.0.0/16", username: "me", tokenFile: "token.txt" };
function sampleValues(task: Task, combo: FieldValues): FieldValues {
  const values = { ...combo };
  for (const field of task.fields) if (values[field.id] === "" && !field.optional) values[field.id] = SAMPLES[field.id] ?? "sample";
  return values;
}

describe("docker task catalog", () => {
  it("has unique kebab-case ids, in category order, with every category used", () => {
    const ids = TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    const order = DOCKER_CATEGORIES.map((c) => c.id);
    const seen = TASKS.map((t) => order.indexOf(t.category));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    for (const category of order) expect(TASKS.some((t) => t.category === category), category).toBe(true);
  });

  it("covers the commands asked for", () => {
    const commands = TASKS.flatMap((t) => resolveTask(t, sampleValues(t, presetValues(t, ""))).status === "ready" ? [] : [t.id]);
    expect(commands).toEqual([]);
    for (const id of ["run", "create", "start", "stop", "restart", "rm", "exec", "logs", "inspect", "ps", "images", "build", "pull", "push", "tag", "rmi", "network-create", "network-connect", "network-disconnect", "volume-create", "volume-inspect", "volume-rm", "login", "logout", "stats", "prune"]) {
      expect(getTask(id), id).toBeDefined();
    }
  });

  it("points only at tasks that exist", () => {
    for (const id of QUICK_START) expect(getTask(id), id).toBeDefined();
    for (const task of TASKS) for (const id of task.related ?? []) expect(getTask(id), `${task.id} related ${id}`).toBeDefined();
  });

  it("has unique field ids, and selects whose default is an option", () => {
    for (const task of TASKS) {
      const ids = task.fields.map((f) => f.id);
      expect(new Set(ids).size, task.id).toBe(ids.length);
      for (const field of task.fields.filter((f) => f.kind === "select")) expect(field.options?.map((o) => o.value), `${task.id}.${field.id}`).toContain(field.default);
    }
  });

  it("builds every option combination, in both shells, into explained steps with the right warnings", () => {
    for (const task of TASKS) {
      for (const combo of fieldCombinations(task)) {
        for (const shell of ["posix", "powershell"] as const) {
          const r = resolveTask(task, sampleValues(task, combo), shell);
          expect(r.status, `${task.id} ${JSON.stringify(combo)}`).toBe("ready");
          if (r.status !== "ready") continue;
          for (const s of r.steps) {
            for (const p of s.parts) {
              expect(p.text.trim(), task.id).not.toBe("");
              expect(p.explain.trim(), `${task.id} "${p.text}"`).not.toBe("");
            }
            if (s.danger === "destructive") expect(s.warning, `${task.id} warning`).toBeTruthy();
            if (s.confirm) expect(s.danger, `${task.id} confirm`).toBe("destructive");
            if (s.saferAlternative) expect(getTask(s.saferAlternative.taskId), `${task.id} safer`).toBeDefined();
          }
        }
      }
    }
  });

  it("has presets that are valid on their own", () => {
    for (const task of TASKS) {
      for (const p of task.presets ?? []) expect(resolveTask(task, presetValues(task, p.id)).status, `${task.id} ${p.id}`).toBe("ready");
    }
  });

  it("marks environment values, build arguments and user names as sensitive", () => {
    const sensitive = TASKS.flatMap((t) => t.fields.filter((f) => f.sensitive).map((f) => `${t.id}.${f.id}`));
    expect(sensitive).toEqual(["run.env", "create.env", "build.buildArgs", "login.username"]);
  });
});

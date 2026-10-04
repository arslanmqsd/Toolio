import { quote } from "./quote";
import type { Args, Danger, Field, FieldValues, Step, Task } from "./types";

export type Resolved =
  | { status: "invalid"; errors: Record<string, string> }
  /** Steps are built with <placeholder> text for the missing fields, so the command's shape still shows. */
  | { status: "incomplete"; missing: Field[]; steps: Step[] }
  | { status: "ready"; steps: Step[] };

export const placeholderToken = (field: Field): string => `<${field.placeholder ?? field.id}>`;

export function defaultValues(task: Task): FieldValues {
  return Object.fromEntries(task.fields.map((field) => [field.id, field.default]));
}

export function visibleFields(task: Task, values: FieldValues): Field[] {
  return task.fields.filter((field) => !field.shownWhen || field.shownWhen(values));
}

const isTyped = (field: Field) => field.kind !== "checkbox" && field.kind !== "select";

function trimmed(values: FieldValues, id: string): string {
  const value = values[id];
  return typeof value === "string" ? value.trim() : "";
}

function makeArgs(task: Task, values: FieldValues, missing: Set<string>): Args {
  function field(id: string): Field {
    const found = task.fields.find((f) => f.id === id);
    if (!found) throw new Error(`Task "${task.id}" has no field "${id}".`);
    return found;
  }
  const token = (id: string) => (missing.has(id) ? placeholderToken(field(id)) : null);

  return {
    q: (id) => token(id) ?? quote(trimmed(values, id)),
    text: (id) => token(id) ?? trimmed(values, id),
    has: (id) => token(id) !== null || trimmed(values, id) !== "",
    flag: (id) => {
      field(id);
      return values[id] === true;
    },
    choice: (id) => String(values[id] ?? field(id).default),
    list: (id) => {
      const placeholder = token(id);
      return placeholder ? [placeholder] : trimmed(values, id).split(/\s+/).filter(Boolean).map(quote);
    },
  };
}

export function resolveTask(task: Task, values: FieldValues): Resolved {
  const errors: Record<string, string> = {};
  const missing = new Set<string>();

  for (const field of visibleFields(task, values)) {
    if (!isTyped(field)) continue;
    const value = trimmed(values, field.id);
    if (value === "") {
      if (!field.optional) missing.add(field.id);
      continue;
    }
    const error = field.validate?.(value);
    if (error) errors[field.id] = error;
  }

  if (Object.keys(errors).length > 0) return { status: "invalid", errors };
  const steps = task.build(makeArgs(task, values, missing));
  if (missing.size > 0) return { status: "incomplete", missing: task.fields.filter((f) => missing.has(f.id)), steps };
  return { status: "ready", steps };
}

export const stepCommand = (step: Step): string => step.parts.map((p) => p.text).join(" ");

export const commandText = (steps: Step[]): string => steps.map(stepCommand).join("\n");

const RANK: Record<Danger, number> = { safe: 0, caution: 1, destructive: 2 };

export function highestDanger(steps: Step[]): Danger {
  return steps.reduce<Danger>((worst, s) => (RANK[s.danger] > RANK[worst] ? s.danger : worst), "safe");
}

/** The task's defaults with every combination of its checkbox and select values. */
export function fieldCombinations(task: Task): FieldValues[] {
  let combos: FieldValues[] = [defaultValues(task)];
  for (const field of task.fields) {
    const options =
      field.kind === "checkbox" ? [false, true] : field.kind === "select" ? (field.options ?? []).map((o) => o.value) : null;
    if (!options) continue;
    combos = combos.flatMap((combo) => options.map((option) => ({ ...combo, [field.id]: option })));
  }
  return combos;
}

/** The most dangerous the task can get, whatever its options: for the badge in the task list. */
export function maxDanger(task: Task): Danger {
  const allTyped = new Set(task.fields.filter(isTyped).map((f) => f.id));
  return highestDanger(fieldCombinations(task).flatMap((values) => task.build(makeArgs(task, values, allTyped))));
}

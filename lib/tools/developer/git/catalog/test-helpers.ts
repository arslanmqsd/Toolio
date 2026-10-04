import { commandText, defaultValues, highestDanger, resolveTask, type Resolved } from "../build";
import type { Danger, FieldValues, Step } from "../types";
import { getTask } from ".";

export function resolve(taskId: string, values: FieldValues = {}): Resolved {
  const task = getTask(taskId);
  if (!task) throw new Error(`No task "${taskId}".`);
  return resolveTask(task, { ...defaultValues(task), ...values });
}

function readySteps(taskId: string, values: FieldValues): Step[] {
  const r = resolve(taskId, values);
  if (r.status === "invalid") throw new Error(`"${taskId}" is invalid: ${JSON.stringify(r.errors)}`);
  if (r.status === "incomplete") throw new Error(`"${taskId}" is missing ${r.missing.map((f) => f.id).join(", ")}`);
  return r.steps;
}

export const command = (taskId: string, values: FieldValues = {}): string => commandText(readySteps(taskId, values));

export const danger = (taskId: string, values: FieldValues = {}): Danger => highestDanger(readySteps(taskId, values));

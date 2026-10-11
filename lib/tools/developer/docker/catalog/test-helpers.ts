import { commandText, defaultValues, highestDanger, presetValues, resolveTask, type Resolved } from "@/lib/command-builder/build";
import type { FieldValues, Shell, Step } from "@/lib/command-builder/types";
import { getTask } from ".";

export function resolve(taskId: string, values: FieldValues = {}, shell: Shell = "posix"): Resolved {
  const task = getTask(taskId);
  if (!task) throw new Error(`No task "${taskId}".`);
  return resolveTask(task, { ...defaultValues(task), ...values }, shell);
}

export function steps(taskId: string, values: FieldValues = {}, shell: Shell = "posix"): Step[] {
  const r = resolve(taskId, values, shell);
  if (r.status === "invalid") throw new Error(`"${taskId}" is invalid: ${JSON.stringify(r.errors)}`);
  if (r.status === "incomplete") throw new Error(`"${taskId}" is missing ${r.missing.map((f) => f.id).join(", ")}`);
  return r.steps;
}

export const command = (taskId: string, values: FieldValues = {}, shell: Shell = "posix"): string => commandText(steps(taskId, values, shell));

export const danger = (taskId: string, values: FieldValues = {}) => highestDanger(steps(taskId, values));

export const preset = (taskId: string, presetId: string) => presetValues(getTask(taskId)!, presetId);

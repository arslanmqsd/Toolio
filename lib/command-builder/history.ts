/**
 * Recently copied commands, kept in this browser only. An entry is the task and its form values, so
 * it reopens as an editable form, and fields marked sensitive (environment values, user names) are
 * never written: storage is readable by anything on the page, and outlives the session.
 */
import { defaultValues } from "./build";
import type { FieldValues, Task } from "./types";

export interface HistoryEntry {
  taskId: string;
  values: FieldValues;
  /** When it was copied, in ms since 1970. */
  at: number;
}

export const MAX_HISTORY = 20;

/** The values worth keeping: no sensitive fields, and nothing still at its default. */
export function storableValues(task: Task, values: FieldValues): FieldValues {
  const defaults = defaultValues(task);
  const kept: FieldValues = {};
  for (const field of task.fields) {
    if (field.sensitive) continue;
    const value = values[field.id];
    if (value !== undefined && value !== defaults[field.id]) kept[field.id] = value;
  }
  return kept;
}

const sameEntry = (a: HistoryEntry, b: HistoryEntry) => a.taskId === b.taskId && JSON.stringify(a.values) === JSON.stringify(b.values);

/** Pure: puts the entry first, drops an older identical one, caps the list. */
export function addHistory(entries: HistoryEntry[], entry: HistoryEntry, max = MAX_HISTORY): HistoryEntry[] {
  return [entry, ...entries.filter((e) => !sameEntry(e, entry))].slice(0, max);
}

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return typeof e.taskId === "string" && typeof e.at === "number" && !!e.values && typeof e.values === "object";
}

/**
 * Entries, newest first. Empty when storage is unavailable or corrupt. Values of fields that are now
 * sensitive are dropped on reading too, in case an older version stored them.
 */
export function readHistory(key: string, getTask: (id: string) => Task | undefined): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).flatMap((e) => {
      const task = getTask(e.taskId);
      return task ? [{ ...e, values: storableValues(task, { ...defaultValues(task), ...e.values }) }] : [];
    });
  } catch {
    return [];
  }
}

export function writeHistory(key: string, entries: HistoryEntry[]): void {
  try {
    if (entries.length) localStorage.setItem(key, JSON.stringify(entries.slice(0, MAX_HISTORY)));
    else localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode etc.): history is a convenience, skip.
  }
}

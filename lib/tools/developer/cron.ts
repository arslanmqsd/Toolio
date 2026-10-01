import { daysInMonth, utcFromWall, wallParts, zonedWallToUtc, type Adjustment } from "@/lib/time-zone";

/**
 * Standard 5-field crontab expressions, read the way Vixie cron / cronie do: names for months and
 * weekdays, 7 as Sunday, and day of month OR day of week when both are restricted.
 */

export type CronFieldId = "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek";

interface FieldSpec {
  id: CronFieldId;
  label: string;
  min: number;
  max: number;
  /** Names accepted in place of numbers, indexed from `min`. */
  names?: string[];
  unit: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const short = (names: string[]) => names.map((name) => name.slice(0, 3).toUpperCase());

export const CRON_FIELDS: readonly FieldSpec[] = [
  { id: "minute", label: "Minute", min: 0, max: 59, unit: "minute" },
  { id: "hour", label: "Hour", min: 0, max: 23, unit: "hour" },
  { id: "dayOfMonth", label: "Day of month", min: 1, max: 31, unit: "day" },
  { id: "month", label: "Month", min: 1, max: 12, names: short(MONTHS), unit: "month" },
  // 7 is Sunday too.
  { id: "dayOfWeek", label: "Day of week", min: 0, max: 7, names: short(WEEKDAYS), unit: "day" },
];

/** Allowed values, for help text: "0–59", "1–12 or JAN–DEC". */
export function fieldRange(id: CronFieldId): string {
  const spec = specFor(id);
  const range = `${spec.min}–${spec.max}`;
  if (!spec.names) return range;
  return `${range} or ${spec.names[0]}–${spec.names[spec.names.length - 1]}`;
}

export const CRON_MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

/** One comma-separated part of a field: `*`, `5`, `1-5`, `*\/15`, `1-30/5` or `5/10`. */
interface CronItem {
  kind: "any" | "value" | "range";
  start: number;
  end: number;
  step: number;
}

export interface CronField {
  text: string;
  items: CronItem[];
  /** Every value the field matches, ascending. */
  values: number[];
  /** Written starting with `*`, which decides how the two day fields combine. */
  star: boolean;
}

export type CronSchedule = Record<CronFieldId, CronField>;

export type FieldResult = { ok: true; field: CronField } | { ok: false; error: string };

export type CronResult =
  | { ok: true; schedule: CronSchedule; /** The five fields, single-spaced, macros expanded. */ fields: string[]; macro: string | null }
  | { ok: false; error: string; /** The field at fault, when there is one. */ field?: CronFieldId };

const specFor = (id: CronFieldId) => CRON_FIELDS.find((spec) => spec.id === id)!;

function parseNumber(spec: FieldSpec, token: string): number | string {
  if (/^\d+$/.test(token)) {
    const n = Number(token);
    return n >= spec.min && n <= spec.max ? n : `${token} is out of range; use ${fieldRange(spec.id)}.`;
  }
  const index = spec.names?.indexOf(token.toUpperCase()) ?? -1;
  if (index >= 0) return spec.min + index;
  return spec.names
    ? `"${token}" isn't a number or a ${spec.unit} name; use ${fieldRange(spec.id)}.`
    : `"${token}" isn't a number; use ${fieldRange(spec.id)}.`;
}

/** Parses one field's text, like "*\/15" or "MON-FRI". */
export function parseCronField(id: CronFieldId, text: string): FieldResult {
  const spec = specFor(id);
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: `${spec.label} is empty; use * for every ${spec.unit}.` };
  const items: CronItem[] = [];
  for (const part of trimmed.split(",")) {
    const match = /^(?:(\*)|(\w+)(?:-(\w+))?)(?:\/(\w+))?$/.exec(part);
    if (!match) return { ok: false, error: part ? `Can't read "${part}".` : "There's an empty item between commas." };
    const [, star, from, to, stepText] = match;
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) < 1) return { ok: false, error: `The step in "${part}" must be a whole number of 1 or more.` };
      step = Number(stepText);
    }
    if (star) {
      items.push({ kind: "any", start: spec.min, end: spec.id === "dayOfWeek" ? 6 : spec.max, step });
      continue;
    }
    const start = parseNumber(spec, from);
    if (typeof start === "string") return { ok: false, error: start };
    let end = to === undefined ? (stepText === undefined ? start : spec.max) : parseNumber(spec, to);
    if (typeof end === "string") return { ok: false, error: end };
    // "5/10" means from 5 to the end; Sunday as 7 only counts as an end, so "SAT-SUN" works.
    if (id === "dayOfWeek" && to !== undefined && end === 0 && start > 0) end = 7;
    if (end < start) return { ok: false, error: `"${part}" runs backwards; ranges can't wrap around, so split it, e.g. 22-23,0-2.` };
    items.push({ kind: to === undefined && stepText === undefined ? "value" : "range", start, end, step });
  }
  const values = new Set<number>();
  for (const item of items) {
    for (let v = item.start; v <= item.end; v += item.step) values.add(id === "dayOfWeek" ? v % 7 : v);
  }
  return {
    ok: true,
    field: { text: trimmed, items, values: [...values].sort((a, b) => a - b), star: trimmed.startsWith("*") },
  };
}

/** The five field texts of an expression, macros expanded; null when it doesn't have five. */
export function splitCron(text: string): string[] | null {
  const trimmed = text.trim();
  const macro = CRON_MACROS[trimmed.toLowerCase()];
  const parts = (macro ?? trimmed).split(/\s+/);
  return parts.length === 5 ? parts : null;
}

export function parseCron(text: string): CronResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Enter a cron expression, like */15 * * * *." };
  if (trimmed.startsWith("@")) {
    const name = trimmed.toLowerCase();
    if (name === "@reboot") return { ok: false, error: "@reboot runs once when the cron daemon starts, so it has no schedule to show." };
    if (!(name in CRON_MACROS)) return { ok: false, error: `Unknown macro "${trimmed}". Try @hourly, @daily, @weekly, @monthly or @yearly.` };
  }
  const fields = splitCron(trimmed);
  if (!fields) {
    const count = trimmed.split(/\s+/).length;
    return {
      ok: false,
      error:
        count > 5
          ? `This has ${count} fields. Crontab uses 5 (minute, hour, day of month, month, day of week); 6 or 7 usually means a seconds or year field from Quartz, Spring or similar, which this tool doesn't read.`
          : `This has ${count} field${count === 1 ? "" : "s"}; crontab needs 5: minute, hour, day of month, month and day of week.`,
    };
  }
  const result = parseCronFields(fields);
  return result.ok ? { ...result, macro: trimmed.startsWith("@") ? trimmed.toLowerCase() : null } : result;
}

/** Parses the five field texts on their own, e.g. while one of them is being edited and is empty. */
export function parseCronFields(fields: string[]): CronResult {
  const schedule = {} as CronSchedule;
  for (const [i, spec] of CRON_FIELDS.entries()) {
    const result = parseCronField(spec.id, fields[i] ?? "");
    if (!result.ok) return { ok: false, error: `${spec.label}: ${result.error}`, field: spec.id };
    schedule[spec.id] = result.field;
  }
  return { ok: true, schedule, fields: fields.map((field) => field.trim()), macro: null };
}

// ── Description ───────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "a", "a and b", "a, b and c". */
function list(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const VALUE_NAMES: Record<CronFieldId, (v: number) => string> = {
  minute: String,
  hour: (v) => `${pad(v)}:00`,
  dayOfMonth: ordinal,
  month: (v) => MONTHS[v - 1],
  dayOfWeek: (v) => WEEKDAYS[v % 7],
};

/** Phrases for the field's ranges and steps; plain values are left to the caller. */
function rangePhrase(id: CronFieldId, item: CronItem): string {
  const spec = specFor(id);
  const name = VALUE_NAMES[id];
  const every = item.step === 1 ? `every ${spec.unit}` : `every ${item.step} ${spec.unit}s`;
  if (item.kind === "any") return every;
  if (id === "hour" && item.step === 1) return `between ${pad(item.start)}:00 and ${pad(item.end)}:59`;
  const span = `${id === "dayOfMonth" ? "the " : ""}${name(item.start)} through ${name(item.end)}`;
  if (item.step === 1) return id === "minute" ? `every minute from ${span}` : span;
  return `${every} from ${span}`;
}

/** Plain values gathered into one phrase, followed by the field's ranges and steps. */
function fieldPhrases(id: CronFieldId, field: CronField, values: (vs: number[]) => string): string[] {
  const plain = field.items.filter((item) => item.kind === "value").map((item) => item.start);
  const rest = field.items.filter((item) => item.kind !== "value").map((item) => rangePhrase(id, item));
  return [...(plain.length ? [values(plain)] : []), ...rest];
}

const onlyValues = (field: CronField) => field.items.every((item) => item.kind === "value");
const isEvery = (field: CronField) => field.items.some((item) => item.kind === "any" && item.step === 1);

/** Plain English for a parsed schedule, like "At 09:00, on Monday through Friday". */
export function describeCron(schedule: CronSchedule): string {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = schedule;
  const clauses: string[] = [];

  if (onlyValues(minute) && onlyValues(hour) && minute.values.length * hour.values.length <= 6) {
    clauses.push(`at ${list(hour.values.flatMap((h) => minute.values.map((m) => `${pad(h)}:${pad(m)}`)))}`);
  } else {
    if (isEvery(minute)) clauses.push("every minute");
    else
      clauses.push(
        list(fieldPhrases("minute", minute, (vs) => `at minute${vs.length > 1 ? "s" : ""} ${list(vs.map(String))}`)) +
          (isEvery(hour) && onlyValues(minute) ? " past every hour" : ""),
      );
    if (!isEvery(hour)) {
      clauses.push(
        list(
          fieldPhrases("hour", hour, (vs) =>
            vs.length === 1 ? rangePhrase("hour", { kind: "range", start: vs[0], end: vs[0], step: 1 }) : `during the ${list(vs.map(VALUE_NAMES.hour))} hours`,
          ),
        ),
      );
    }
  }

  const dom = isEvery(dayOfMonth)
    ? null
    : `${list(fieldPhrases("dayOfMonth", dayOfMonth, (vs) => `the ${list(vs.map(VALUE_NAMES.dayOfMonth))}`)).replace(/^(?!every)/, "on ")} of the month`;
  const dow = isEvery(dayOfWeek) ? null : list(fieldPhrases("dayOfWeek", dayOfWeek, (vs) => list(vs.map(VALUE_NAMES.dayOfWeek)))).replace(/^(?!every)/, "on ");
  if (dom && dow) clauses.push(dayOfMonth.star || dayOfWeek.star ? `${dom}, if it's ${dow.replace(/^on /, "a ")}` : `${dom} or ${dow}`);
  else if (dom || dow) clauses.push((dom ?? dow)!);

  if (!isEvery(month)) {
    clauses.push(list(fieldPhrases("month", month, (vs) => list(vs.map(VALUE_NAMES.month)))).replace(/^(?!every)/, "in "));
  }

  const sentence = clauses.join(", ");
  return sentence[0].toUpperCase() + sentence.slice(1);
}

/** Plain English for one field on its own, like "every 15 minutes" or "Monday through Friday". */
export function describeCronField(id: CronFieldId, field: CronField): string {
  if (isEvery(field)) return id === "dayOfMonth" || id === "dayOfWeek" ? "any day" : `every ${specFor(id).unit}`;
  return list(fieldPhrases(id, field, (vs) => list(vs.map(VALUE_NAMES[id]))));
}

/** Whether day of month and day of week are both restricted, so a day matching either one runs. */
export function daysCombineWithOr(schedule: CronSchedule): boolean {
  return !schedule.dayOfMonth.star && !schedule.dayOfWeek.star;
}

// ── Next runs ─────────────────────────────────────────────────────────────

export interface CronRun {
  ms: number;
  /** "gap": a DST jump skipped the wall time, so the run moved forward by the jump. "ambiguous": the time happens twice; this is the first. */
  adjustment: Adjustment;
}

/** Far enough for any schedule that runs at all: even Feb 29 on a given weekday comes round within 40 years. */
const SEARCH_YEARS = 50;

function dayMatches(schedule: CronSchedule, year: number, month: number, day: number): boolean {
  const { dayOfMonth, dayOfWeek } = schedule;
  const dom = dayOfMonth.values.includes(day);
  const dow = dayOfWeek.values.includes(new Date(utcFromWall(year, month, day)).getUTCDay());
  return dayOfMonth.star || dayOfWeek.star ? dom && dow : dom || dow;
}

/**
 * The next `count` runs strictly after `fromMs`, with the schedule read as wall-clock times in `timeZone`.
 * Times a DST jump skips move forward by the jump, like cronie runs them; times that happen twice run once.
 * Returns fewer when the schedule never runs again (like February 30th).
 */
export function nextCronRuns(schedule: CronSchedule, fromMs: number, timeZone: string, count: number): CronRun[] {
  const runs: CronRun[] = [];
  const start = wallParts(Math.floor(fromMs / 60_000) * 60_000 + 60_000, timeZone);
  let last = fromMs;
  for (let year = start.year; year <= start.year + SEARCH_YEARS; year++) {
    for (const month of schedule.month.values) {
      if (year === start.year && month < start.month) continue;
      const firstMonth = year === start.year && month === start.month;
      for (let day = firstMonth ? start.day : 1; day <= daysInMonth(year, month); day++) {
        if (!dayMatches(schedule, year, month, day)) continue;
        const firstDay = firstMonth && day === start.day;
        for (const hour of schedule.hour.values) {
          if (firstDay && hour < start.hour) continue;
          for (const minute of schedule.minute.values) {
            if (firstDay && hour === start.hour && minute < start.minute) continue;
            const run = zonedWallToUtc(utcFromWall(year, month, day, hour, minute), timeZone);
            // A skipped time moved past the jump can land on, or before, a time that really exists.
            if (run.ms <= last) continue;
            runs.push(run);
            last = run.ms;
            if (runs.length === count) return runs;
          }
        }
      }
    }
  }
  return runs;
}

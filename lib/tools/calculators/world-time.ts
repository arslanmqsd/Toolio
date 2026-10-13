/**
 * Comparing one moment across time zones: resolving a wall time in a zone
 * (including DST gaps and repeated hours), finding clock changes, and laying
 * out a day as hours in each zone for meeting planning. Everything comes from
 * Intl, so it uses the browser's own time zone data.
 */

import { timeZoneOffsetMs, utcFromWall, wallParts, type WallParts } from "@/lib/time-zone";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type Occurrence = "first" | "second";

export type WallTimeResult =
  | {
      ok: true;
      ms: number;
      /** "gap": the time doesn't exist and was moved forward; "ambiguous": it happens twice. */
      adjustment: "gap" | "ambiguous" | null;
      /** For an ambiguous time, both instants, earlier first. */
      occurrences?: [number, number];
    }
  | { ok: false; error: string };

const DATE = /^(-?\d{4,6})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** The instant a date ("2026-03-29") and time ("02:30") on the clocks of `zone` mean. */
export function resolveWallTime(date: string, time: string, zone: string, occurrence: Occurrence = "first"): WallTimeResult {
  const d = DATE.exec(date);
  const t = TIME.exec(time);
  if (!d) return { ok: false, error: "Enter a date." };
  if (!t) return { ok: false, error: "Enter a time." };
  const [hour, minute, second] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  if (hour > 23 || minute > 59 || second > 59) return { ok: false, error: "Enter a time between 00:00 and 23:59." };
  const wall = utcFromWall(Number(d[1]), Number(d[2]), Number(d[3]), hour, minute, second);

  // Offsets change by far less than a day, so the offsets a day either side cover every reading.
  const candidates = [...new Set([wall - timeZoneOffsetMs(wall - DAY, zone), wall - timeZoneOffsetMs(wall + DAY, zone)])].sort((a, b) => a - b);
  const valid = candidates.filter((ms) => wall - ms === timeZoneOffsetMs(ms, zone));
  if (valid.length === 2) {
    return { ok: true, ms: occurrence === "second" ? valid[1] : valid[0], adjustment: "ambiguous", occurrences: [valid[0], valid[1]] };
  }
  if (valid.length === 1) return { ok: true, ms: valid[0], adjustment: null };
  // Skipped by a jump forward: read it with the offset from before the jump, which lands after it.
  return { ok: true, ms: wall - timeZoneOffsetMs(wall - DAY, zone), adjustment: "gap" };
}

/** Whether daylight saving (or any offset above the zone's lowest that year) is in effect. */
export function isDaylightSaving(ms: number, zone: string): boolean {
  const year = new Date(ms).getUTCFullYear();
  const january = timeZoneOffsetMs(Date.UTC(year, 0, 1), zone);
  const july = timeZoneOffsetMs(Date.UTC(year, 6, 1), zone);
  return january !== july && timeZoneOffsetMs(ms, zone) > Math.min(january, july);
}

export interface Transition {
  /** First instant on the new offset. */
  at: number;
  offsetBefore: number;
  offsetAfter: number;
  abbrBefore: string;
  abbrAfter: string;
  /** Wall clock just before and right after, as if UTC: 02:00 → 03:00 for a spring jump. */
  wallBefore: number;
  wallAfter: number;
}

function transitionAt(zone: string, lo: number, hi: number): Transition {
  // lo is on the old offset, hi on the new one. Narrow to the millisecond.
  const before = timeZoneOffsetMs(lo, zone);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (timeZoneOffsetMs(mid, zone) === before) lo = mid;
    else hi = mid;
  }
  // timeZoneOffsetMs works in whole seconds, so round to the second the change happened on.
  const at = Math.ceil(hi / 1000) * 1000;
  const offsetAfter = timeZoneOffsetMs(at, zone);
  return {
    at,
    offsetBefore: before,
    offsetAfter,
    abbrBefore: wallParts(at - 1000, zone).abbr,
    abbrAfter: wallParts(at, zone).abbr,
    wallBefore: at + before,
    wallAfter: at + offsetAfter,
  };
}

/** The nearest clock change after (direction 1) or before (-1) `from`, looking up to `days` away. */
export function findTransition(zone: string, from: number, direction: 1 | -1, days = 400): Transition | null {
  let prev = from;
  let prevOffset = timeZoneOffsetMs(from, zone);
  for (let i = 1; i <= days; i++) {
    const next = from + direction * i * DAY;
    const offset = timeZoneOffsetMs(next, zone);
    if (offset !== prevOffset) return direction === 1 ? transitionAt(zone, prev, next) : transitionAt(zone, next, prev);
    prev = next;
    prevOffset = offset;
  }
  return null;
}

/** "1 h", "30 min", "1 h 30 min". */
export function formatSpan(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / MINUTE);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ") || "0 min";
}

/** "+5 h", "−4 h 30 min", "same time": how far ahead `offset` is of `reference`. */
export function formatDifference(offset: number, reference: number): string {
  const diff = offset - reference;
  if (diff === 0) return "same time";
  return `${diff > 0 ? "+" : "−"}${formatSpan(diff)}`;
}

/** Calendar days between two wall dates: 1 when `parts` is the day after `reference`. */
export function dayDifference(parts: WallParts, reference: WallParts): number {
  return Math.round((utcFromWall(parts.year, parts.month, parts.day) - utcFromWall(reference.year, reference.month, reference.day)) / DAY);
}

export type HourKind = "work" | "day" | "night";

export interface PlannerCell {
  hour: number;
  minute: number;
  /** Days ahead of (or behind, negative) the planned day in the source zone. */
  dayOffset: number;
  /** "Wednesday". */
  weekday: string;
  kind: HourKind;
}

export interface PlannerDay {
  /** The start of each hour of the day in the source zone: 23, 24 or 25 of them. */
  hours: number[];
  /** cells[zoneIndex][hourIndex]. */
  cells: PlannerCell[][];
  /** Hour indexes where every zone is in working hours. */
  overlap: number[];
}

export interface WorkingHours {
  start: number;
  end: number;
}

function kindOf(hour: number, minute: number, work: WorkingHours): HourKind {
  const t = hour + minute / 60;
  if (t >= work.start && t < work.end) return "work";
  return t >= 7 && t < 22 ? "day" : "night";
}

/** The source zone's calendar day hour by hour, and what each hour is on the clocks of each zone. */
export function planDay(date: string, sourceZone: string, zones: string[], work: WorkingHours = { start: 9, end: 17 }): PlannerDay | null {
  const start = resolveWallTime(date, "00:00", sourceZone);
  const d = DATE.exec(date);
  if (!start.ok || !d) return null;
  const nextDay = new Date(utcFromWall(Number(d[1]), Number(d[2]), Number(d[3])) + DAY).toISOString().slice(0, 10);
  const end = resolveWallTime(nextDay, "00:00", sourceZone);
  if (!end.ok) return null;

  const hours: number[] = [];
  for (let ms = start.ms; ms < end.ms; ms += HOUR) hours.push(ms);
  const sourceDay = wallParts(start.ms, sourceZone);
  const cells = zones.map((zone) =>
    hours.map((ms) => {
      const p = wallParts(ms, zone);
      return { hour: p.hour, minute: p.minute, dayOffset: dayDifference(p, sourceDay), weekday: p.weekday, kind: kindOf(p.hour, p.minute, work) };
    }),
  );
  const overlap = hours.flatMap((_, i) => (cells.every((row) => row[i].kind === "work") ? [i] : []));
  return { hours, cells, overlap };
}

/** "Europe/London" → "London", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

/** "09:30", or "9:30 AM" on a 12-hour clock. */
export function formatClock(hour: number, minute: number, hour12 = false): string {
  const mm = String(minute).padStart(2, "0");
  if (!hour12) return `${String(hour).padStart(2, "0")}:${mm}`;
  return `${hour % 12 || 12}:${mm} ${hour < 12 ? "AM" : "PM"}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Wed 1 Jul 2026". */
export function formatWallDate(p: Pick<WallParts, "weekday" | "day" | "month" | "year">): string {
  return `${p.weekday.slice(0, 3)} ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** Wall-clock parts of a wall time stored as if it were UTC (like Transition.wallBefore). */
export function partsOfWall(wall: number): Pick<WallParts, "weekday" | "day" | "month" | "year" | "hour" | "minute"> {
  const d = new Date(wall);
  return {
    weekday: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()],
    day: d.getUTCDate(),
    month: d.getUTCMonth() + 1,
    year: d.getUTCFullYear(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** True when the runtime knows the IANA zone. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Contiguous runs of hour indexes: [2, 3, 4, 9] → [[2, 4], [9, 9]]. */
export function runs(indexes: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const i of indexes) {
    const last = out[out.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else out.push([i, i]);
  }
  return out;
}

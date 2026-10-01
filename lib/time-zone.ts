/** Time zone helpers built on Intl: offsets, wall times and formatting in any IANA zone. */

/** How a wall time that doesn't map to exactly one instant was resolved. */
export type Adjustment = "gap" | "ambiguous" | null;

const DAY = 86_400_000;

const mod = (n: number, m: number) => ((n % m) + m) % m;

export interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
  abbr: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      era: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "long",
      timeZoneName: "short",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function wallParts(ms: number, timeZone: string): WallParts {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(ms)) parts[part.type] = part.value;
  const year = Number(parts.year);
  return {
    year: parts.era === "BC" || parts.era === "B" ? 1 - year : year,
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
    abbr: parts.timeZoneName,
  };
}

/** Days in a month (1–12) of the proleptic Gregorian calendar. */
export function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Milliseconds since the epoch for a wall time read as UTC. Unlike Date.UTC, years 0–99 aren't shifted to 1900s. */
export function utcFromWall(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, ms);
  return date.getTime();
}

/** The zone's offset from UTC at an instant, in milliseconds (positive east of Greenwich). */
export function timeZoneOffsetMs(ms: number, timeZone: string): number {
  const p = wallParts(ms, timeZone);
  return utcFromWall(p.year, p.month, p.day, p.hour, p.minute, p.second) - (ms - mod(ms, 1000));
}

/**
 * Converts a wall time (given as if it were UTC) in a zone to an instant. Times skipped by a DST
 * jump move forward by the jump; times that happen twice resolve to the earlier one.
 */
export function zonedWallToUtc(wall: number, timeZone: string): { ms: number; adjustment: Adjustment } {
  // Offsets differ by far less than a day, so any transition near this wall time lies between these.
  const before = wall - timeZoneOffsetMs(wall - DAY, timeZone);
  const after = wall - timeZoneOffsetMs(wall + DAY, timeZone);
  const valid = [...new Set([before, after])].filter((ms) => wall - ms === timeZoneOffsetMs(ms, timeZone));
  if (valid.length === 2) return { ms: Math.min(...valid), adjustment: "ambiguous" };
  if (valid.length === 1) return { ms: valid[0], adjustment: null };
  return { ms: before, adjustment: "gap" };
}

/** Formats an offset as ±HH:MM, adding :SS for historical offsets that have seconds. */
export function formatOffset(offsetMs: number): string {
  const total = Math.round(Math.abs(offsetMs) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const seconds = total % 60;
  return `${offsetMs < 0 ? "-" : "+"}${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}${seconds ? `:${pad(seconds)}` : ""}`;
}

export interface ZonedTime {
  /** YYYY-MM-DD. */
  date: string;
  /** HH:MM:SS, plus .mmm when there are milliseconds. */
  time: string;
  offset: string;
  /** Short zone name, like "EST" or "GMT+5". */
  abbr: string;
  weekday: string;
  /** ISO 8601 with the zone's offset ("Z" for UTC). */
  iso: string;
}

function formatYear(year: number): string {
  if (year >= 0 && year <= 9999) return String(year).padStart(4, "0");
  return `${year < 0 ? "-" : "+"}${String(Math.abs(year)).padStart(6, "0")}`;
}

export function formatInTimeZone(ms: number, timeZone: string): ZonedTime {
  const p = wallParts(ms, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fraction = mod(ms, 1000);
  const date = `${formatYear(p.year)}-${pad(p.month)}-${pad(p.day)}`;
  const time = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${fraction ? `.${String(fraction).padStart(3, "0")}` : ""}`;
  const offset = formatOffset(timeZoneOffsetMs(ms, timeZone));
  const isUtc = timeZone === "UTC" || timeZone === "Etc/UTC";
  return { date, time, offset, abbr: p.abbr, weekday: p.weekday, iso: `${date}T${time}${isUtc ? "Z" : offset}` };
}

/** IANA zones the runtime knows, UTC first. */
export function listTimeZones(): string[] {
  const zones = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return ["UTC", ...zones.filter((zone) => zone !== "UTC")];
}

/** The viewer's zone, falling back to UTC. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Precision of a Unix timestamp: seconds, milliseconds, microseconds, or nanoseconds. */
export type TimeUnit = "s" | "ms" | "us" | "ns";

/** How a wall time that doesn't map to exactly one instant was resolved. */
export type Adjustment = "gap" | "ambiguous" | null;

export type ParsedTime =
  | { ok: true; kind: "timestamp"; ms: number; unit: TimeUnit }
  | { ok: true; kind: "date"; ms: number; zoned: boolean; adjustment: Adjustment }
  | { ok: false; error: string };

const DAY = 86_400_000;
/** Largest distance from the epoch a JavaScript Date can hold. */
const MAX_MS = 8.64e15;

const NS_PER: Record<TimeUnit, bigint> = { s: BigInt(1e9), ms: BigInt(1e6), us: BigInt(1e3), ns: BigInt(1) };
const NS_PER_MS = BigInt(1e6);
const ZERO = BigInt(0);
const FRACTION_DIGITS: Record<TimeUnit, number> = { s: 9, ms: 6, us: 3, ns: 0 };

/** Guesses a timestamp's unit from its size. Any date from 1973 to 5138 is detected correctly. */
export function detectUnit(value: number): TimeUnit {
  const abs = Math.abs(value);
  if (abs < 1e11) return "s";
  if (abs < 1e14) return "ms";
  if (abs < 1e17) return "us";
  return "ns";
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

function parseTimestamp(text: string, unit: TimeUnit | "auto"): ParsedTime {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.replace(/(?<=\d)[_,](?=\d)/g, ""));
  if (!match) return { ok: false, error: "Not a number." };
  const [, sign, whole, fraction = ""] = match;
  const resolved = unit === "auto" ? detectUnit(Number(whole)) : unit;
  // Work in integer nanoseconds so large µs/ns values keep their precision.
  const digits = FRACTION_DIGITS[resolved];
  const abs = BigInt(whole) * NS_PER[resolved] + BigInt(fraction.slice(0, digits).padEnd(digits, "0") || "0");
  const ns = sign ? -abs : abs;
  const floorMs = ns / NS_PER_MS - (ns % NS_PER_MS < ZERO ? BigInt(1) : ZERO);
  const ms = Number(floorMs);
  if (Math.abs(ms) > MAX_MS) {
    return { ok: false, error: "That's too far from 1970 to be a date (the limit is about 275,000 years either way)." };
  }
  return { ok: true, kind: "timestamp", ms, unit: resolved };
}

interface WallParts {
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

function wallParts(ms: number, timeZone: string): WallParts {
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

/** Milliseconds since the epoch for a wall time read as UTC. Unlike Date.UTC, years 0–99 aren't shifted to 1900s. */
function utcFromWall(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): number {
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
function zonedWallToUtc(wall: number, timeZone: string): { ms: number; adjustment: Adjustment } {
  // Offsets differ by far less than a day, so any transition near this wall time lies between these.
  const before = wall - timeZoneOffsetMs(wall - DAY, timeZone);
  const after = wall - timeZoneOffsetMs(wall + DAY, timeZone);
  const valid = [...new Set([before, after])].filter((ms) => wall - ms === timeZoneOffsetMs(ms, timeZone));
  if (valid.length === 2) return { ms: Math.min(...valid), adjustment: "ambiguous" };
  if (valid.length === 1) return { ms: valid[0], adjustment: null };
  return { ms: before, adjustment: "gap" };
}

const DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:(?:T|\s+)(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2}(?::?\d{2})?)?)?$/i;

function parseDate(text: string, timeZone: string): ParsedTime {
  const match = DATE_PATTERN.exec(text);
  if (match) {
    const [, y, mo, d, h = "0", mi = "0", s = "0", frac = "", offset] = match;
    const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, s].map(Number);
    const daysInMonth = new Date(Date.UTC(2000, month, 0)).getUTCDate() - (month === 2 && !isLeap(year) ? 1 : 0);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return { ok: false, error: `${y}-${mo}-${d} isn't a real date.` };
    if (hour > 23 || minute > 59 || second > 59) return { ok: false, error: `${h}:${mi}:${s} isn't a real time of day.` };
    const wall = utcFromWall(year, month, day, hour, minute, second, Number(frac.slice(0, 3).padEnd(3, "0")));
    if (offset) {
      const sign = offset[0] === "-" ? -1 : 1;
      const digits = offset.replace(/\D/g, "");
      const [oh, om, os] = [0, 2, 4].map((i) => Number(digits.slice(i, i + 2) || 0));
      const offsetMs = sign * (oh * 3600 + om * 60 + os) * 1000;
      return { ok: true, kind: "date", ms: wall - offsetMs, zoned: false, adjustment: null };
    }
    return { ok: true, kind: "date", ...zonedWallToUtc(wall, timeZone), zoned: true };
  }
  // Other formats are only trusted when they name their offset (e.g. RFC 2822 "… GMT"); the browser would read the rest in its own zone.
  const ms = Date.parse(text);
  if (/[a-z]/i.test(text) && /\b(GMT|UTC|UT)\b|[+-]\d{4}\b|\dZ\b/i.test(text) && !Number.isNaN(ms)) {
    return { ok: true, kind: "date", ms, zoned: false, adjustment: null };
  }
  return { ok: false, error: "Can't read this as a timestamp or a date. Try 1700000000 or 2026-09-29 14:30." };
}

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Reads a Unix timestamp or a date. Dates without an offset are read in `timeZone`. */
export function parseTimeInput(text: string, timeZone: string, unit: TimeUnit | "auto" = "auto"): ParsedTime {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Enter a Unix timestamp or a date." };
  if (/^-?[\d_,]+(\.\d+)?$/.test(trimmed)) return parseTimestamp(trimmed, unit);
  return parseDate(trimmed, timeZone);
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

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Rough distance from `now`, like "3 days ago" or "in 2 hours". */
export function relativeTime(ms: number, now: number): string {
  const seconds = (ms - now) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFormat.format(Math.round(seconds), "second");
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3600), "hour");
  const days = seconds / 86_400;
  if (Math.abs(days) < 30) return relativeFormat.format(Math.round(days), "day");
  if (Math.abs(days) < 365) return relativeFormat.format(Math.round(days / 30.44), "month");
  return relativeFormat.format(Math.round(days / 365.25), "year");
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

import { daysInMonth, utcFromWall, zonedWallToUtc, type Adjustment } from "@/lib/time-zone";

/** Precision of a Unix timestamp: seconds, milliseconds, microseconds, or nanoseconds. */
export type TimeUnit = "s" | "ms" | "us" | "ns";

export type ParsedTime =
  | { ok: true; kind: "timestamp"; ms: number; unit: TimeUnit }
  | { ok: true; kind: "date"; ms: number; zoned: boolean; adjustment: Adjustment }
  | { ok: false; error: string };

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

const DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:(?:T|\s+)(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2}(?::?\d{2})?)?)?$/i;

function parseDate(text: string, timeZone: string): ParsedTime {
  const match = DATE_PATTERN.exec(text);
  if (match) {
    const [, y, mo, d, h = "0", mi = "0", s = "0", frac = "", offset] = match;
    const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, s].map(Number);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return { ok: false, error: `${y}-${mo}-${d} isn't a real date.` };
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

/** Reads a Unix timestamp or a date. Dates without an offset are read in `timeZone`. */
export function parseTimeInput(text: string, timeZone: string, unit: TimeUnit | "auto" = "auto"): ParsedTime {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Enter a Unix timestamp or a date." };
  if (/^-?[\d_,]+(\.\d+)?$/.test(trimmed)) return parseTimestamp(trimmed, unit);
  return parseDate(trimmed, timeZone);
}

import { describe, expect, it } from "vitest";
import {
  detectUnit,
  formatInTimeZone,
  formatOffset,
  listTimeZones,
  parseTimeInput,
  relativeTime,
  timeZoneOffsetMs,
  type ParsedTime,
} from "./unix-time";

const T = 1_700_000_000_000; // 2023-11-14T22:13:20Z
const HOUR = 3_600_000;

const ok = (result: ParsedTime) => {
  if (!result.ok) throw new Error(result.error);
  return result;
};

// Deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe("detectUnit", () => {
  it.each([
    [0, "s"],
    [-1, "s"],
    [1_700_000_000, "s"],
    [99_999_999_999, "s"],
    [1_700_000_000_000, "ms"],
    [1_700_000_000_000_000, "us"],
    [1_700_000_000_000_000_000, "ns"],
    [-1_700_000_000_000, "ms"],
  ] as const)("%d → %s", (n, unit) => {
    expect(detectUnit(n)).toBe(unit);
  });
});

describe("parseTimeInput: timestamps", () => {
  it("reads each unit", () => {
    expect(ok(parseTimeInput("1700000000", "UTC"))).toMatchObject({ kind: "timestamp", ms: T, unit: "s" });
    expect(ok(parseTimeInput("1700000000123", "UTC"))).toMatchObject({ ms: T + 123, unit: "ms" });
    expect(ok(parseTimeInput("1700000000123456", "UTC"))).toMatchObject({ ms: T + 123, unit: "us" });
    expect(ok(parseTimeInput("1700000000123456789", "UTC"))).toMatchObject({ ms: T + 123, unit: "ns" });
  });

  it("honours an explicit unit", () => {
    expect(ok(parseTimeInput("1700000000", "UTC", "ms")).ms).toBe(1_700_000_000);
  });

  it("accepts fractions, negatives, whitespace and digit separators", () => {
    expect(ok(parseTimeInput(" 1700000000.5 ", "UTC")).ms).toBe(T + 500);
    expect(ok(parseTimeInput("-86400", "UTC")).ms).toBe(-86_400_000);
    expect(ok(parseTimeInput("1_700_000_000", "UTC")).ms).toBe(T);
    expect(ok(parseTimeInput("1,700,000,000", "UTC")).ms).toBe(T);
  });

  it("rejects timestamps outside the range dates can represent", () => {
    const result = parseTimeInput("9000000000000000", "UTC", "ms");
    expect(result.ok).toBe(false);
  });
});

describe("parseTimeInput: dates", () => {
  it("uses the offset written in the date, ignoring the picked zone", () => {
    expect(ok(parseTimeInput("2023-11-14T22:13:20Z", "Asia/Tokyo"))).toMatchObject({ kind: "date", ms: T, zoned: false });
    expect(ok(parseTimeInput("2023-11-15T03:43:20+05:30", "UTC")).ms).toBe(T);
    expect(ok(parseTimeInput("2023-11-15T03:43:20+0530", "UTC")).ms).toBe(T);
    expect(ok(parseTimeInput("2023-11-14T22:13:20.250Z", "UTC")).ms).toBe(T + 250);
  });

  it("reads dates without an offset in the picked zone", () => {
    expect(ok(parseTimeInput("2023-11-14 22:13:20", "UTC"))).toMatchObject({ ms: T, zoned: true });
    expect(ok(parseTimeInput("2023-11-15 03:13:20", "Asia/Karachi")).ms).toBe(T);
    expect(ok(parseTimeInput("2023-11-14T17:13:20", "America/New_York")).ms).toBe(T);
    expect(ok(parseTimeInput("2023-11-14", "UTC")).ms).toBe(T - (22 * HOUR + 13 * 60_000 + 20_000));
  });

  it("moves times in a DST gap forward", () => {
    // 02:30 doesn't exist in New York on 2026-03-08; clocks jump from 02:00 to 03:00.
    expect(ok(parseTimeInput("2026-03-08 02:30", "America/New_York"))).toMatchObject({
      ms: Date.UTC(2026, 2, 8, 7, 30),
      adjustment: "gap",
    });
  });

  it("picks the earlier instant for times that happen twice", () => {
    // 01:30 happens twice in New York on 2026-11-01.
    expect(ok(parseTimeInput("2026-11-01 01:30", "America/New_York"))).toMatchObject({
      ms: Date.UTC(2026, 10, 1, 5, 30),
      adjustment: "ambiguous",
    });
  });

  it("reads RFC 2822 / HTTP dates", () => {
    expect(ok(parseTimeInput("Tue, 14 Nov 2023 22:13:20 GMT", "Asia/Tokyo")).ms).toBe(T);
  });

  it("rejects impossible or unreadable dates", () => {
    for (const text of ["2026-02-30", "2026-13-01", "2026-01-01 24:00", "hello", "", "12abc"]) {
      expect(parseTimeInput(text, "UTC").ok, text).toBe(false);
    }
  });

  it("round-trips 2,000 random instants through their wall time in random zones", () => {
    const zones = listTimeZones();
    const rand = rng(7);
    for (let n = 0; n < 2000; n++) {
      const ms = Math.floor((rand() * 2 - 0.5) * 4e12);
      const zone = zones[Math.floor(rand() * zones.length)];
      const f = formatInTimeZone(ms, zone);
      expect(ok(parseTimeInput(f.iso, "UTC")).ms, `${f.iso}`).toBe(ms);
      const wall = ok(parseTimeInput(`${f.date} ${f.time}`, zone));
      if (wall.ms !== ms) expect(wall.kind === "date" && wall.adjustment, `${f.date} ${f.time} ${zone}`).toBe("ambiguous");
    }
  });
});

describe("timeZoneOffsetMs / formatOffset", () => {
  it("finds offsets, including DST and half hours", () => {
    expect(timeZoneOffsetMs(T, "UTC")).toBe(0);
    expect(timeZoneOffsetMs(T, "Asia/Kolkata")).toBe(5.5 * HOUR);
    expect(timeZoneOffsetMs(T, "America/New_York")).toBe(-5 * HOUR);
    expect(timeZoneOffsetMs(Date.UTC(2023, 6, 1), "America/New_York")).toBe(-4 * HOUR);
  });

  it("formats offsets", () => {
    expect(formatOffset(0)).toBe("+00:00");
    expect(formatOffset(5.5 * HOUR)).toBe("+05:30");
    expect(formatOffset(-4 * HOUR)).toBe("-04:00");
    expect(formatOffset(-(4 * HOUR + 56 * 60_000 + 2_000))).toBe("-04:56:02");
  });
});

describe("formatInTimeZone", () => {
  it("formats in the zone", () => {
    expect(formatInTimeZone(T, "UTC")).toMatchObject({
      date: "2023-11-14",
      time: "22:13:20",
      offset: "+00:00",
      iso: "2023-11-14T22:13:20Z",
      weekday: "Tuesday",
    });
    expect(formatInTimeZone(T + 5, "Asia/Kolkata")).toMatchObject({
      date: "2023-11-15",
      time: "03:43:20.005",
      iso: "2023-11-15T03:43:20.005+05:30",
      weekday: "Wednesday",
    });
  });

  it("handles years before 1000 and before 1970", () => {
    expect(formatInTimeZone(Date.UTC(1969, 11, 31, 23, 59, 59), "UTC").iso).toBe("1969-12-31T23:59:59Z");
    const d = new Date(0);
    d.setUTCFullYear(12, 0, 1);
    expect(formatInTimeZone(d.getTime(), "UTC").iso).toBe("0012-01-01T00:00:00Z");
  });
});

describe("relativeTime", () => {
  it.each([
    [0, "now"],
    [-30_000, "30 seconds ago"],
    [90_000, "in 2 minutes"],
    [-3 * HOUR, "3 hours ago"],
    [-24 * HOUR, "yesterday"],
    [5 * 24 * HOUR, "in 5 days"],
    [-60 * 24 * HOUR, "2 months ago"],
    [800 * 24 * HOUR, "in 2 years"],
  ])("%d ms → %s", (delta, text) => {
    expect(relativeTime(T + delta, T)).toBe(text);
  });
});

describe("listTimeZones", () => {
  it("starts with UTC and has no duplicates", () => {
    const zones = listTimeZones();
    expect(zones[0]).toBe("UTC");
    expect(zones).toContain("America/New_York");
    expect(new Set(zones).size).toBe(zones.length);
  });
});

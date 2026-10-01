import { describe, expect, it } from "vitest";
import { formatInTimeZone, formatOffset, listTimeZones, timeZoneOffsetMs, utcFromWall, zonedWallToUtc } from "./time-zone";

const T = 1_700_000_000_000; // 2023-11-14T22:13:20Z
const HOUR = 3_600_000;

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

describe("listTimeZones", () => {
  it("starts with UTC and has no duplicates", () => {
    const zones = listTimeZones();
    expect(zones[0]).toBe("UTC");
    expect(zones).toContain("America/New_York");
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe("zonedWallToUtc", () => {
  it("reads a wall time in the zone", () => {
    expect(zonedWallToUtc(utcFromWall(2023, 11, 14, 17, 13, 20), "America/New_York")).toEqual({ ms: T, adjustment: null });
  });

  it("moves times in a DST gap forward and takes the first of repeated times", () => {
    // New York skipped 02:00–02:59 on 2026-03-08 and repeats 01:00–01:59 on 2026-11-01.
    expect(zonedWallToUtc(utcFromWall(2026, 3, 8, 2, 30), "America/New_York")).toEqual({
      ms: Date.UTC(2026, 2, 8, 7, 30),
      adjustment: "gap",
    });
    expect(zonedWallToUtc(utcFromWall(2026, 11, 1, 1, 30), "America/New_York")).toEqual({
      ms: Date.UTC(2026, 10, 1, 5, 30),
      adjustment: "ambiguous",
    });
  });
});

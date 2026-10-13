import { describe, expect, it } from "vitest";
import { wallParts } from "@/lib/time-zone";
import { dayDifference, findTransition, formatClock, formatDifference, formatSpan, formatWallDate, isTimeZone, partsOfWall, runs, isDaylightSaving, planDay, resolveWallTime, zoneCity } from "./world-time";

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("resolveWallTime", () => {
  it("reads a wall time in a zone", () => {
    const r = resolveWallTime("2026-07-01", "09:30", "America/New_York");
    expect(r.ok && iso(r.ms)).toBe("2026-07-01T13:30:00.000Z");
    expect(r.ok && r.adjustment).toBeNull();
    const k = resolveWallTime("2026-07-01", "09:30", "Asia/Kolkata");
    expect(k.ok && iso(k.ms)).toBe("2026-07-01T04:00:00.000Z");
  });

  it("moves a time skipped by a spring jump forward", () => {
    const r = resolveWallTime("2026-03-08", "02:30", "America/New_York");
    expect(r.ok && r.adjustment).toBe("gap");
    expect(r.ok && iso(r.ms)).toBe("2026-03-08T07:30:00.000Z"); // 03:30 EDT
  });

  it("offers both readings of a repeated hour", () => {
    const first = resolveWallTime("2026-11-01", "01:30", "America/New_York");
    const second = resolveWallTime("2026-11-01", "01:30", "America/New_York", "second");
    expect(first.ok && first.adjustment).toBe("ambiguous");
    expect(first.ok && iso(first.ms)).toBe("2026-11-01T05:30:00.000Z"); // EDT
    expect(second.ok && iso(second.ms)).toBe("2026-11-01T06:30:00.000Z"); // EST
    expect(first.ok && first.occurrences?.map(iso)).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
  });

  it("rejects bad input", () => {
    expect(resolveWallTime("", "10:00", "UTC")).toEqual({ ok: false, error: "Enter a date." });
    expect(resolveWallTime("2026-01-01", "", "UTC")).toEqual({ ok: false, error: "Enter a time." });
    expect(resolveWallTime("2026-01-01", "24:00", "UTC")).toMatchObject({ ok: false });
  });
});

describe("isDaylightSaving", () => {
  it("knows summer time in both hemispheres, and zones without it", () => {
    expect(isDaylightSaving(Date.UTC(2026, 6, 1), "Europe/London")).toBe(true);
    expect(isDaylightSaving(Date.UTC(2026, 0, 15), "Europe/London")).toBe(false);
    expect(isDaylightSaving(Date.UTC(2026, 0, 15), "Australia/Sydney")).toBe(true);
    expect(isDaylightSaving(Date.UTC(2026, 6, 1), "Asia/Tokyo")).toBe(false);
  });
});

describe("findTransition", () => {
  it("finds the next and previous clock change to the second", () => {
    const from = Date.UTC(2026, 5, 1);
    const next = findTransition("Europe/London", from, 1)!;
    expect(iso(next.at)).toBe("2026-10-25T01:00:00.000Z");
    expect([next.offsetBefore, next.offsetAfter]).toEqual([HOUR, 0]);
    expect([next.abbrBefore, next.abbrAfter]).toEqual(["GMT+1", "GMT"]);
    expect([iso(next.wallBefore), iso(next.wallAfter)]).toEqual(["2026-10-25T02:00:00.000Z", "2026-10-25T01:00:00.000Z"]);

    const prev = findTransition("America/New_York", from, -1)!;
    expect(iso(prev.at)).toBe("2026-03-08T07:00:00.000Z");
    expect([iso(prev.wallBefore), iso(prev.wallAfter)]).toEqual(["2026-03-08T02:00:00.000Z", "2026-03-08T03:00:00.000Z"]);
  });

  it("finds none in zones without clock changes", () => {
    expect(findTransition("Asia/Tokyo", Date.UTC(2026, 0, 1), 1)).toBeNull();
    expect(findTransition("UTC", Date.UTC(2026, 0, 1), -1)).toBeNull();
  });
});

describe("formatting", () => {
  it("writes spans and differences", () => {
    expect(formatSpan(HOUR)).toBe("1 h");
    expect(formatSpan(1.5 * HOUR)).toBe("1 h 30 min");
    expect(formatSpan(0.75 * HOUR)).toBe("45 min");
    expect(formatDifference(9 * HOUR, 0)).toBe("+9 h");
    expect(formatDifference(-4 * HOUR, 5.5 * HOUR)).toBe("−9 h 30 min");
    expect(formatDifference(HOUR, HOUR)).toBe("same time");
  });

  it("counts calendar days between zones", () => {
    const ms = Date.UTC(2026, 0, 1, 23);
    expect(dayDifference(wallParts(ms, "Asia/Tokyo"), wallParts(ms, "UTC"))).toBe(1);
    expect(dayDifference(wallParts(ms, "Pacific/Honolulu"), wallParts(ms, "UTC"))).toBe(0);
  });

  it("names zones by city", () => {
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zoneCity("UTC")).toBe("UTC");
  });
});

describe("planDay", () => {
  it("lays out a day hour by hour in each zone, with the working-hours overlap", () => {
    const plan = planDay("2026-07-01", "Europe/London", ["Europe/London", "America/New_York"])!;
    expect(plan.hours).toHaveLength(24);
    expect(plan.cells[1][0]).toMatchObject({ hour: 19, minute: 0, dayOffset: -1, kind: "day" });
    expect(plan.cells[1][14]).toMatchObject({ hour: 9, minute: 0, dayOffset: 0, kind: "work" });
    // London 14:00–16:00 is New York 09:00–11:00.
    expect(plan.overlap).toEqual([14, 15, 16]);
  });

  it("has 23 or 25 hours on clock-change days", () => {
    expect(planDay("2026-03-29", "Europe/London", ["UTC"])!.hours).toHaveLength(23);
    expect(planDay("2026-10-25", "Europe/London", ["UTC"])!.hours).toHaveLength(25);
  });

  it("shows half-hour zones and night hours", () => {
    const plan = planDay("2026-07-01", "UTC", ["Asia/Kolkata"])!;
    expect(plan.cells[0][0]).toMatchObject({ hour: 5, minute: 30, dayOffset: 0, kind: "night" });
  });
});

describe("helpers", () => {
  it("formats clocks and dates", () => {
    expect(formatClock(9, 5)).toBe("09:05");
    expect(formatClock(0, 0, true)).toBe("12:00 AM");
    expect(formatClock(13, 30, true)).toBe("1:30 PM");
    expect(formatWallDate(partsOfWall(Date.UTC(2026, 6, 1, 14)))).toBe("Wed 1 Jul 2026");
  });

  it("checks zones and groups runs", () => {
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(runs([2, 3, 4, 9])).toEqual([[2, 4], [9, 9]]);
    expect(runs([])).toEqual([]);
  });
});

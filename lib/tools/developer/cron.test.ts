import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "@/lib/time-zone";
import { describeCron, describeCronField, nextCronRuns, parseCron, parseCronField, splitCron, type CronSchedule } from "./cron";

const schedule = (text: string): CronSchedule => {
  const result = parseCron(text);
  if (!result.ok) throw new Error(result.error);
  return result.schedule;
};

const values = (id: Parameters<typeof parseCronField>[0], text: string) => {
  const result = parseCronField(id, text);
  if (!result.ok) throw new Error(result.error);
  return result.field.values;
};

/** Next runs as wall times in the zone, "YYYY-MM-DD HH:MM". */
const runs = (text: string, from: string, zone = "UTC", count = 5) =>
  nextCronRuns(schedule(text), Date.parse(from), zone, count).map(({ ms }) => {
    const t = formatInTimeZone(ms, zone);
    return `${t.date} ${t.time.slice(0, 5)}`;
  });

describe("parseCronField", () => {
  it("reads values, ranges, steps and lists", () => {
    expect(values("minute", "*/15")).toEqual([0, 15, 30, 45]);
    expect(values("minute", "5/20")).toEqual([5, 25, 45]);
    expect(values("hour", "9-17/4,23")).toEqual([9, 13, 17, 23]);
    expect(values("dayOfMonth", "1,15")).toEqual([1, 15]);
  });

  it("reads month and weekday names, with 7 as Sunday", () => {
    expect(values("month", "jan-mar,DEC")).toEqual([1, 2, 3, 12]);
    expect(values("dayOfWeek", "MON-FRI")).toEqual([1, 2, 3, 4, 5]);
    expect(values("dayOfWeek", "5-7")).toEqual([0, 5, 6]);
    expect(values("dayOfWeek", "SAT-SUN")).toEqual([0, 6]);
    expect(values("dayOfWeek", "*")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it.each([
    ["minute", "60", "60 is out of range; use 0–59."],
    ["hour", "", "Hour is empty; use * for every hour."],
    ["minute", "*/0", 'The step in "*/0" must be a whole number of 1 or more.'],
    ["hour", "22-2", '"22-2" runs backwards; ranges can\'t wrap around, so split it, e.g. 22-23,0-2.'],
    ["month", "FOO", '"FOO" isn\'t a number or a month name; use 1–12 or JAN–DEC.'],
    ["minute", "1,,2", "There's an empty item between commas."],
    ["minute", "?", 'Can\'t read "?".'],
  ] as const)("%s %j → error", (id, text, error) => {
    expect(parseCronField(id, text)).toEqual({ ok: false, error });
  });
});

describe("parseCron", () => {
  it("expands macros and normalises spacing", () => {
    expect(splitCron("  0  9 * *   1-5 ")).toEqual(["0", "9", "*", "*", "1-5"]);
    expect(parseCron("@Daily")).toMatchObject({ ok: true, fields: ["0", "0", "*", "*", "*"], macro: "@daily" });
  });

  it("explains the wrong number of fields, @reboot and unknown macros", () => {
    expect(parseCron("0 0 9 * * MON")).toMatchObject({ ok: false, error: expect.stringContaining("6 fields") });
    expect(parseCron("0 9 *")).toMatchObject({ ok: false, error: expect.stringContaining("3 fields") });
    expect(parseCron("@reboot")).toMatchObject({ ok: false, error: expect.stringContaining("once") });
    expect(parseCron("@often")).toMatchObject({ ok: false, error: expect.stringContaining("Unknown macro") });
  });

  it("names the field at fault", () => {
    expect(parseCron("0 24 * * *")).toEqual({ ok: false, error: "Hour: 24 is out of range; use 0–23.", field: "hour" });
  });
});

describe("describeCron", () => {
  it.each([
    ["* * * * *", "Every minute"],
    ["*/15 * * * *", "Every 15 minutes"],
    ["5 * * * *", "At minute 5 past every hour"],
    ["0,30 * * * *", "At minutes 0 and 30 past every hour"],
    ["0 9 * * *", "At 09:00"],
    ["30 9,17 * * 1-5", "At 09:30 and 17:30, on Monday through Friday"],
    ["*/15 9-17 * * MON-FRI", "Every 15 minutes, between 09:00 and 17:59, on Monday through Friday"],
    ["0 */2 * * *", "At minute 0, every 2 hours"],
    ["*/5 9 * * *", "Every 5 minutes, between 09:00 and 09:59"],
    ["0 0 1 * *", "At 00:00, on the 1st of the month"],
    ["0 0 1,15 * 1", "At 00:00, on the 1st and 15th of the month or on Monday"],
    ["0 0 1-7 * *", "At 00:00, on the 1st through 7th of the month"],
    ["0 0 1 1 *", "At 00:00, on the 1st of the month, in January"],
    ["0 12 * 6-8 0,6", "At 12:00, on Sunday and Saturday, in June through August"],
    ["0 0 * */3 *", "At 00:00, every 3 months"],
    ["0 0 */2 * 1", "At 00:00, every 2 days of the month, if it's a Monday"],
    ["10-20 * * * *", "Every minute from 10 through 20"],
  ])("%s → %s", (text, description) => {
    expect(describeCron(schedule(text))).toBe(description);
  });

  it("describes single fields", () => {
    expect(describeCronField("dayOfWeek", schedule("* * * * 1-5").dayOfWeek)).toBe("Monday through Friday");
    expect(describeCronField("dayOfMonth", schedule("* * * * *").dayOfMonth)).toBe("any day");
    expect(describeCronField("hour", schedule("* */6 * * *").hour)).toBe("every 6 hours");
  });
});

describe("nextCronRuns", () => {
  it("finds the next runs strictly after the start", () => {
    expect(runs("*/15 * * * *", "2026-10-01T10:15:00Z", "UTC", 3)).toEqual(["2026-10-01 10:30", "2026-10-01 10:45", "2026-10-01 11:00"]);
    expect(runs("0 9 * * 1-5", "2026-10-02T09:00:30Z", "UTC", 2)).toEqual(["2026-10-05 09:00", "2026-10-06 09:00"]);
  });

  it("reads the schedule in the chosen zone", () => {
    expect(runs("0 9 * * *", "2026-10-01T00:00:00Z", "Asia/Kolkata", 1)).toEqual(["2026-10-01 09:00"]);
    expect(nextCronRuns(schedule("0 9 * * *"), Date.parse("2026-10-01T00:00:00Z"), "Asia/Kolkata", 1)[0].ms).toBe(
      Date.parse("2026-10-01T03:30:00Z"),
    );
  });

  it("runs on either day field when both are restricted, and on both when one starts with *", () => {
    // 2026-10-01 is a Thursday.
    expect(runs("0 0 13 * 5", "2026-10-01T00:00:00Z", "UTC", 3)).toEqual(["2026-10-02 00:00", "2026-10-09 00:00", "2026-10-13 00:00"]);
    expect(runs("0 0 */10 * 5", "2026-10-01T00:00:00Z", "UTC", 2)).toEqual(["2026-12-11 00:00", "2027-01-01 00:00"]);
  });

  it("finds rare dates and gives up on impossible ones", () => {
    expect(runs("0 0 29 2 *", "2026-10-01T00:00:00Z", "UTC", 2)).toEqual(["2028-02-29 00:00", "2032-02-29 00:00"]);
    expect(runs("0 0 30 2 *", "2026-10-01T00:00:00Z")).toEqual([]);
  });

  it("moves times skipped by DST forward and runs repeated times once", () => {
    // New York skips 02:00–02:59 on 2026-03-08 and repeats 01:00–01:59 on 2026-11-01.
    expect(runs("30 2 * * *", "2026-03-07T12:00:00Z", "America/New_York", 3)).toEqual([
      "2026-03-08 03:30",
      "2026-03-09 02:30",
      "2026-03-10 02:30",
    ]);
    const fallBack = nextCronRuns(schedule("30 1 * * *"), Date.parse("2026-10-31T12:00:00Z"), "America/New_York", 2);
    expect(fallBack.map((run) => new Date(run.ms).toISOString())).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-02T06:30:00.000Z"]);
    expect(fallBack[0].adjustment).toBe("ambiguous");
  });

  it("doesn't repeat runs when every minute of a skipped hour moves forward", () => {
    const times = nextCronRuns(schedule("* * * * *"), Date.parse("2026-03-08T06:58:00Z"), "America/New_York", 4).map((run) => run.ms);
    expect(new Set(times).size).toBe(4);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { isFormulaCell } from "@/lib/csv/write";
import { parseCsv } from "@/lib/tools/data/json-csv";
import { CITIES } from "./fake-data-lists";
import { DEFAULT_FAKE_DATA, FAKE_FIELDS, MAX_FAKE_ROWS, generateFakeData, type FakeDataOptions, type FakeFieldId } from "./fake-data";

const ALL = FAKE_FIELDS.map((f) => f.id);

const gen = (options: Partial<FakeDataOptions> = {}) => {
  const r = generateFakeData({ ...DEFAULT_FAKE_DATA, ...options });
  if (!r.ok) throw new Error(r.error);
  return r;
};
const rows = (options: Partial<FakeDataOptions> = {}) => JSON.parse(gen({ ...options, format: "json" }).value) as Record<string, string | boolean>[];

describe("generateFakeData", () => {
  it("makes the number of rows asked for, with the chosen fields in a fixed order", () => {
    const r = rows({ count: 25, fields: ["email", "id", "firstName"] });
    expect(r).toHaveLength(25);
    expect(r.every((row) => Object.keys(row).join() === "id,firstName,email")).toBe(true);
  });

  it("writes realistic, well-formed values", () => {
    for (const row of rows({ count: 300, fields: ALL, seed: 9 })) {
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(row.fullName).toBe(`${row.firstName} ${row.lastName}`);
      expect(row.email).toMatch(/^[a-z0-9._]+@example\.(com|org|net)$/);
      expect(row.username).toMatch(/^[a-z0-9._]+$/);
      expect(row.phone).toMatch(/^\(\d{3}\) 555-01\d{2}$/);
      const [, , zipPrefix, areaCode] = CITIES.find(([city, state]) => city === row.city && state === row.state)!;
      expect(row.phone).toContain(`(${areaCode})`);
      expect(row.zip).toMatch(new RegExp(`^${zipPrefix}`));
      expect(row.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(Number.isNaN(Date.parse(row.birthDate as string))).toBe(false);
      expect(row.street).toMatch(/^\d+ [A-Z]/);
      expect(row.state).toMatch(/^[A-Z]{2}$/);
      expect(row.zip).toMatch(/^\d{5}$/);
      expect(row.country).toBe("United States");
      expect(typeof row.isActive).toBe("boolean");
      for (const key of ["company", "jobTitle", "city"]) expect(row[key]).toMatch(/^\S.*\S$/);
    }
  });

  it("keeps ids, emails and usernames unique, as database columns often must be", () => {
    const r = rows({ count: MAX_FAKE_ROWS, fields: ["id", "email", "username"], seed: 3 });
    for (const key of ["id", "email", "username"]) expect(new Set(r.map((row) => row[key])).size).toBe(MAX_FAKE_ROWS);
  });

  it("derives emails and usernames from the name", () => {
    for (const row of rows({ count: 50, fields: ["firstName", "lastName", "email"] })) {
      const local = (row.email as string).split("@")[0];
      const ascii = (s: string) => s.normalize("NFD").replace(/[^a-z]/gi, "").toLowerCase();
      expect(local.includes(ascii(row.lastName as string)) || local.includes(ascii(row.firstName as string))).toBe(true);
    }
  });

  it("writes snake_case keys when asked", () => {
    expect(Object.keys(rows({ fields: ["firstName", "createdAt", "isActive", "id"], keyStyle: "snake" })[0])).toEqual(["id", "first_name", "created_at", "is_active"]);
  });
});

describe("reproducibility", () => {
  it("gives the same data for the same seed, and different data for another", () => {
    expect(gen({ seed: 5 }).value).toBe(gen({ seed: 5 }).value);
    expect(gen({ seed: 5 }).value).not.toBe(gen({ seed: 6 }).value);
  });

  it("doesn't reshuffle when fields, format or row count change", () => {
    const some = rows({ fields: ["email"], count: 5 });
    const more = rows({ fields: ALL, count: 20 });
    expect(more.slice(0, 5).map((row) => row.email)).toEqual(some.map((row) => row.email));
    const csv = parseCsv(gen({ fields: ["id", "email"], format: "csv" }).value, ",");
    const json = rows({ fields: ["id", "email"] });
    expect(csv.ok && csv.rows.slice(1)).toEqual(json.map((row) => [row.id, row.email]));
  });
});

describe("CSV", () => {
  it("writes a header and one line per row, with nothing a spreadsheet would run as a formula", () => {
    const r = gen({ count: 200, fields: ALL, format: "csv", seed: 11 });
    const parsed = parseCsv(r.value, ",");
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.rows[0]).toEqual(ALL);
    expect(parsed.rows).toHaveLength(201);
    expect(parsed.rows.flat().some(isFormulaCell)).toBe(false);
  });

  it("previews the same table", () => {
    const r = gen({ count: 3, fields: ["id", "isActive"], format: "csv" });
    expect(r.table.header).toEqual(["id", "isActive"]);
    expect(r.table.rows).toHaveLength(3);
    expect(r.table.rowCount).toBe(3);
    expect(r.table.columnCount).toBe(2);
    expect(["true", "false"]).toContain(r.table.rows[0][1]);
  });
});

describe("limits", () => {
  it("clamps the row count and says so", () => {
    const over = gen({ count: MAX_FAKE_ROWS + 1 });
    expect(over.table.rowCount).toBe(MAX_FAKE_ROWS);
    expect(over.notices).toEqual([{ kind: "warning", message: expect.stringContaining(MAX_FAKE_ROWS.toLocaleString("en-US")) }]);
    const under = gen({ count: 0 });
    expect(under.table.rowCount).toBe(1);
    expect(under.notices[0].message).toMatch(/at least 1/i);
    expect(gen({ count: MAX_FAKE_ROWS }).notices).toEqual([]);
  });

  it("needs at least one field", () => {
    expect(generateFakeData({ ...DEFAULT_FAKE_DATA, fields: [] })).toEqual({ ok: false, error: "Choose at least one field." });
  });
});

describe("side effects", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("never calls Math.random or fetch", () => {
    const random = vi.spyOn(Math, "random");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const format of ["json", "csv"] as const) gen({ format, fields: ALL as FakeFieldId[], count: 100 });
    expect(random).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

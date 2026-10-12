import { describe, expect, it } from "vitest";
import { bestUnit, convert, pow, formatBest, formatRatio, parseAmount, parseSize, parseUnit, unitById, UNITS, type Ratio } from "./data-size";

const B = unitById("B")!;
const to = (text: string, unit: string, decimals: number | "exact" = "exact") => {
  const r = parseSize(text, B);
  if (!r.ok) throw new Error(r.error);
  return formatRatio(convert(r.bits, unitById(unit)!), decimals).text;
};

describe("parseAmount", () => {
  it("reads plain, grouped, fractional and exponent numbers exactly", () => {
    expect(parseAmount("1,024")).toEqual({ n: BigInt(1024), d: BigInt(1) });
    expect(parseAmount("0.1")).toEqual({ n: BigInt(1), d: BigInt(10) });
    expect(parseAmount(".5")).toEqual({ n: BigInt(1), d: BigInt(2) });
    expect(parseAmount("2e9")).toEqual({ n: BigInt(2000000000), d: BigInt(1) });
    expect(parseAmount("1.5e-3")).toEqual({ n: BigInt(3), d: BigInt(2000) });
    expect(parseAmount("1.2.3")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("parseUnit", () => {
  it("tells bytes from bits by the case of b", () => {
    expect(parseUnit("MB")?.unit.id).toBe("MB");
    expect(parseUnit("Mb")?.unit.id).toBe("Mbit");
    expect(parseUnit("Mbps")?.unit.id).toBe("Mbit");
    expect(parseUnit("B")?.unit.id).toBe("B");
    expect(parseUnit("b")?.unit.id).toBe("bit");
  });

  it("reads all-lowercase mb as megabytes, with a note", () => {
    const m = parseUnit("mb");
    expect(m?.unit.id).toBe("MB");
    expect(m?.note).toBe("Read “mb” as megabytes. Write Mb or Mbit for megabits.");
    expect(parseUnit("kib")).toEqual({ unit: unitById("KiB") });
  });

  it("reads names, short prefixes and binary units", () => {
    expect(parseUnit("gibibytes")?.unit.id).toBe("GiB");
    expect(parseUnit("Kilobyte")?.unit.id).toBe("KB");
    expect(parseUnit("megabits")?.unit.id).toBe("Mbit");
    expect(parseUnit("bytes")?.unit.id).toBe("B");
    expect(parseUnit("G")?.unit.id).toBe("GB");
    expect(parseUnit("TiB")?.unit.id).toBe("TiB");
    expect(parseUnit("kB")?.unit.id).toBe("KB");
    expect(parseUnit("Kib")).toBeNull();
    expect(parseUnit("XB")).toBeNull();
  });
});

describe("parseSize", () => {
  it("reads a number with or without a unit", () => {
    expect(to("1.5 GiB", "B")).toBe("1,610,612,736");
    expect(to("500MB", "B")).toBe("500,000,000");
    expect(to("8 Gbit", "GB")).toBe("1");
    expect(to("2048", "KiB")).toBe("2");
    expect(to("1 PiB", "B")).toBe("1,125,899,906,842,624");
    expect(to("3 bit", "B")).toBe("0.375");
  });

  it("uses the fallback unit only when none is typed", () => {
    const r = parseSize("4", unitById("GiB")!);
    expect(r.ok && r.unit.id).toBe("GiB");
    expect(r.ok && r.typedUnit).toBe(false);
  });

  it("explains what's wrong", () => {
    expect(parseSize("  ", B)).toEqual({ ok: false, error: "Enter a size, like 1.5 GiB or 500 MB." });
    expect(parseSize("-1 GB", B)).toEqual({ ok: false, error: "Sizes can't be negative." });
    expect(parseSize("5 parsecs", B)).toMatchObject({ ok: false, error: expect.stringContaining("Unknown unit “parsecs”") });
    expect(parseSize("GB", B)).toMatchObject({ ok: false });
  });
});

describe("formatRatio", () => {
  const r = (n: bigint, d: bigint): Ratio => ({ n, d });

  it("writes every digit when exact", () => {
    expect(formatRatio(r(BigInt(1), pow(BigInt(1024), 3)), "exact").text).toBe("0.000000000931322574615478515625");
    expect(to("1 TB", "TiB")).toBe("0.9094947017729282379150390625");
  });

  it("rounds half up and trims zeros", () => {
    expect(formatRatio(r(BigInt(1000000000000), pow(BigInt(1024), 4)), 2)).toEqual({ text: "0.91", exact: false });
    expect(formatRatio(r(BigInt(15), BigInt(1000)), 2).text).toBe("0.02");
    expect(formatRatio(r(BigInt(3), BigInt(2)), 2)).toEqual({ text: "1.5", exact: true });
    expect(formatRatio(r(BigInt(1234567), BigInt(1)), 2).text).toBe("1,234,567");
    expect(formatRatio(r(BigInt(1234567), BigInt(1)), 2, { grouping: false }).text).toBe("1234567");
  });

  it("keeps three significant digits for amounts too small for the chosen places", () => {
    expect(formatRatio(r(BigInt(1), pow(BigInt(1000), 3)), 2).text).toBe("0.000000001");
    expect(formatRatio(r(BigInt(1), pow(BigInt(1024), 3)), 2).text).toBe("0.000000000931");
  });
});

describe("bestUnit", () => {
  it("picks the largest unit with at least 1", () => {
    const bits = (text: string) => {
      const p = parseSize(text, B);
      if (!p.ok) throw new Error();
      return p.bits;
    };
    expect(formatBest(bits("1 TB"), "binary")).toBe("931.32 GiB");
    expect(formatBest(bits("1 TB"), "decimal")).toBe("1 TB");
    expect(formatBest(bits("1536 KiB"), "binary")).toBe("1.5 MiB");
    expect(bestUnit(bits("100"), "decimal").id).toBe("B");
    expect(bestUnit(bits("0"), "binary").id).toBe("B");
  });

  it("has a unique id per unit", () => {
    expect(new Set(UNITS.map((u) => u.id)).size).toBe(UNITS.length);
  });
});

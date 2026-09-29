import { describe, expect, it } from "vitest";
import { createUuidGenerator, formatUuid, formatUuidList, uuidTimestamp, type UuidVersion } from "./uuid";

const T = Date.UTC(2022, 1, 22, 19, 22, 22); // RFC 9562 test vectors use this instant
const PATTERN = (v: number) => new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-${v}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`);

// Deterministic byte source so failures are reproducible.
function bytes(seed: number) {
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      out[i] = seed >>> 24;
    }
    return out;
  };
}

describe("createUuidGenerator", () => {
  it.each([
    ["v1", 1],
    ["v4", 4],
    ["v7", 7],
  ] as [UuidVersion, number][])("%s has the right version and variant bits", (version, digit) => {
    const next = createUuidGenerator(version);
    for (let n = 0; n < 1000; n++) expect(next()).toMatch(PATTERN(digit));
  });

  it.each(["v1", "v4", "v7"] as UuidVersion[])("%s never repeats in 20,000 ids made in the same millisecond", (version) => {
    const next = createUuidGenerator(version, { now: () => T });
    const ids = Array.from({ length: 20_000 }, next);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("v7 ids sort in creation order, even within one millisecond", () => {
    let clock = T;
    const next = createUuidGenerator("v7", { now: () => clock, random: bytes(1) });
    const ids: string[] = [];
    for (let n = 0; n < 10_000; n++) {
      if (n % 3000 === 0) clock++;
      ids.push(next());
    }
    expect([...ids].sort()).toEqual(ids);
  });

  it("v7 keeps sorting when the clock goes backwards", () => {
    let clock = T;
    const next = createUuidGenerator("v7", { now: () => clock, random: bytes(2) });
    const a = next();
    clock -= 5000;
    const b = next();
    expect(b > a).toBe(true);
  });

  it("builds v7 ids from the clock and random bytes", () => {
    const next = createUuidGenerator("v7", { now: () => T, random: () => new Uint8Array(10).fill(0xff) });
    expect(next()).toBe("017f22e2-79b0-77ff-bfff-ffffffffffff");
  });

  it.each(["v1", "v7"] as UuidVersion[])("%s embeds the current time", (version) => {
    const next = createUuidGenerator(version, { now: () => T + 123 });
    expect(uuidTimestamp(next())).toBe(T + 123);
  });
});

describe("uuidTimestamp", () => {
  it("reads the RFC 9562 test vectors", () => {
    expect(uuidTimestamp("C232AB00-9414-11EC-B3C8-9F6BDECED846")).toBe(T);
    expect(uuidTimestamp("017F22E2-79B0-7CC3-98C4-DC0C0C07398F")).toBe(T);
  });

  it("returns null for versions without a time", () => {
    expect(uuidTimestamp("919108f7-52d1-4320-9bac-f847db4148a8")).toBeNull();
  });
});

describe("formatUuid", () => {
  const id = "017f22e2-79b0-7cc3-98c4-dc0c0c07398f";

  it("applies case, hyphens and braces", () => {
    expect(formatUuid(id, { uppercase: false, hyphens: true, braces: false })).toBe(id);
    expect(formatUuid(id, { uppercase: true, hyphens: true, braces: false })).toBe(id.toUpperCase());
    expect(formatUuid(id, { uppercase: false, hyphens: false, braces: false })).toBe("017f22e279b07cc398c4dc0c0c07398f");
    expect(formatUuid(id, { uppercase: false, hyphens: true, braces: true })).toBe(`{${id}}`);
  });

  it("joins lists as lines, JSON or CSV", () => {
    expect(formatUuidList(["a", "b"], "lines")).toBe("a\nb");
    expect(formatUuidList(["a", "b"], "json")).toBe('[\n  "a",\n  "b"\n]');
    expect(formatUuidList(["a", "b"], "csv")).toBe("a,b");
  });
});

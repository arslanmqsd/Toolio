import { describe, expect, it } from "vitest";
import { MAX_SEED, between, createRng, parseSeed, pick, randomSeed } from "./seeded";

describe("createRng", () => {
  it("is reproducible from a seed and stays in [0, 1)", () => {
    const a = createRng(42);
    const b = createRng(42);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(createRng(43)()).not.toBe(createRng(42)());
  });

  it("picks whole numbers in range and items from a list", () => {
    const rng = createRng(1);
    const values = Array.from({ length: 1000 }, () => between(rng, 3, 5));
    expect(new Set(values)).toEqual(new Set([3, 4, 5]));
    expect(["a", "b"]).toContain(pick(rng, ["a", "b"]));
  });
});

describe("seeds", () => {
  it("picks a 32-bit seed", () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED).toBe(true);
  });

  it("reads a typed seed", () => {
    expect(parseSeed(" 42 ")).toBe(42);
    expect(parseSeed("0")).toBe(0);
    expect(parseSeed(String(MAX_SEED))).toBe(MAX_SEED);
    expect(parseSeed(String(MAX_SEED + 1))).toBeNull();
    for (const bad of ["", "-1", "1.5", "abc", "1e3"]) expect(parseSeed(bad)).toBeNull();
  });
});

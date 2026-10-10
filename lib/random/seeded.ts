/**
 * Reproducible randomness for generated sample data: the same seed always gives the same values.
 * Not for secrets, ids that must not be guessed, or anything security-related.
 */

export type Rng = () => number;

export const MAX_SEED = 0xffffffff;

/** mulberry32: a small, fast PRNG with values in [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed. It isn't secret; it only lets the same output be made again. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** A whole number from `min` to `max`, both included. */
export const between = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

/** A seed typed by the user: a whole number from 0 to MAX_SEED, or null. */
export function parseSeed(text: string): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null;
  const seed = Number(text);
  return seed <= MAX_SEED ? seed : null;
}

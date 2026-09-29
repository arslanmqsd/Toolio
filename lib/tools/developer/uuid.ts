export type UuidVersion = "v1" | "v4" | "v7";

export interface UuidFormat {
  uppercase: boolean;
  hyphens: boolean;
  braces: boolean;
}

export type UuidListFormat = "lines" | "json" | "csv";

export interface UuidDeps {
  /** Milliseconds since the epoch. */
  now?: () => number;
  /** Cryptographically random bytes. */
  random?: (n: number) => Uint8Array;
}

/** Most ids one bulk request may produce. */
export const MAX_UUIDS = 10_000;

/** 100-ns intervals between 1582-10-15 (the Gregorian reform, v1's epoch) and 1970-01-01. */
const GREGORIAN_OFFSET = BigInt(122_192_928_000_000_000);
const TICKS_PER_MS = 10_000;

const cryptoRandom = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function toHyphenated(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function setVersionAndVariant(bytes: Uint8Array, version: number): Uint8Array {
  bytes[6] = (bytes[6] & 0x0f) | (version << 4);
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes;
}

/**
 * Returns a function producing lowercase, hyphenated UUIDs. Time-based versions keep state so ids made
 * in the same millisecond stay unique, and v7 ids stay in creation order (RFC 9562 §6.2, method 1).
 */
export function createUuidGenerator(version: UuidVersion, deps: UuidDeps = {}): () => string {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? cryptoRandom;

  if (version === "v4") return () => toHyphenated(setVersionAndVariant(random(16), 4));

  if (version === "v7") {
    let lastMs = -Infinity;
    let counter = 0; // 12-bit rand_a, used as a counter within one millisecond
    return () => {
      const rand = random(10);
      let ms = now();
      if (ms > lastMs) {
        // Seed the counter with a random value in the lower half, leaving room to count up.
        counter = ((rand[0] & 0x07) << 8) | rand[1];
      } else {
        ms = lastMs;
        counter++;
        if (counter > 0xfff) {
          ms++;
          counter = 0;
        }
      }
      lastMs = ms;
      const bytes = new Uint8Array(16);
      for (let i = 0; i < 6; i++) bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff;
      bytes[6] = counter >> 8;
      bytes[7] = counter & 0xff;
      bytes.set(rand.subarray(2), 8);
      return toHyphenated(setVersionAndVariant(bytes, 7));
    };
  }

  // v1: random node id with the multicast bit set, as RFC 9562 §6.10 recommends instead of a MAC address.
  const seed = random(8);
  const node = seed.subarray(0, 6);
  node[0] |= 0x01;
  let clockSeq = ((seed[6] << 8) | seed[7]) & 0x3fff;
  let lastTicks = BigInt(-1);
  return () => {
    let ticks = BigInt(now()) * BigInt(TICKS_PER_MS) + GREGORIAN_OFFSET;
    if (ticks <= lastTicks) {
      // Same millisecond: count through its 10,000 sub-ms ticks; if the clock went back, bump the sequence.
      if (ticks + BigInt(TICKS_PER_MS) > lastTicks + BigInt(1)) ticks = lastTicks + BigInt(1);
      else clockSeq = (clockSeq + 1) & 0x3fff;
    }
    lastTicks = ticks;
    const timeLow = Number(ticks & BigInt(0xffffffff));
    const timeMid = Number((ticks >> BigInt(32)) & BigInt(0xffff));
    const timeHigh = Number((ticks >> BigInt(48)) & BigInt(0x0fff));
    const bytes = new Uint8Array(16);
    bytes[0] = timeLow >>> 24;
    bytes[1] = (timeLow >>> 16) & 0xff;
    bytes[2] = (timeLow >>> 8) & 0xff;
    bytes[3] = timeLow & 0xff;
    bytes[4] = timeMid >> 8;
    bytes[5] = timeMid & 0xff;
    bytes[6] = timeHigh >> 8;
    bytes[7] = timeHigh & 0xff;
    bytes[8] = clockSeq >> 8;
    bytes[9] = clockSeq & 0xff;
    bytes.set(node, 10);
    return toHyphenated(setVersionAndVariant(bytes, 1));
  };
}

/** Milliseconds since the epoch embedded in a v1 or v7 UUID; null for other versions or invalid input. */
export function uuidTimestamp(uuid: string): number | null {
  const hex = uuid.replace(/[{}-]/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  if (hex[12] === "7") return parseInt(hex.slice(0, 12), 16);
  if (hex[12] === "1") {
    const ticks = BigInt(`0x${hex.slice(13, 16)}${hex.slice(8, 12)}${hex.slice(0, 8)}`);
    return Number((ticks - GREGORIAN_OFFSET) / BigInt(TICKS_PER_MS));
  }
  return null;
}

export function formatUuid(uuid: string, format: UuidFormat): string {
  let out = format.hyphens ? uuid : uuid.replace(/-/g, "");
  if (format.uppercase) out = out.toUpperCase();
  return format.braces ? `{${out}}` : out;
}

export function formatUuidList(ids: string[], format: UuidListFormat): string {
  if (format === "json") return JSON.stringify(ids, null, 2);
  return ids.join(format === "csv" ? "," : "\n");
}

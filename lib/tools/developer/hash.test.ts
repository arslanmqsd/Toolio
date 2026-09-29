import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HASH_ALGORITHMS, Md5, digestMatches, encodeDigest, hashAll, hashBytes, md5 } from "./hash";

const utf8 = (text: string) => new TextEncoder().encode(text);
const hex = (bytes: Uint8Array) => encodeDigest(bytes, "hex");

// Deterministic byte source so failures are reproducible.
function randomBytes(seed: number, n: number) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out[i] = seed >>> 24;
  }
  return out;
}

const NODE_NAMES = { md5: "md5", sha1: "sha1", sha256: "sha256" } as const;

describe("md5", () => {
  it.each([
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["The quick brown fox jumps over the lazy dog", "9e107d9d372bb6826bd81d3542a419d6"],
    ["café 日本 😀", createHash("md5").update("café 日本 😀").digest("hex")],
  ])("md5(%j)", (text, expected) => {
    expect(hex(md5(utf8(text)))).toBe(expected);
  });

  it("matches node:crypto for every length from 0 to 300 bytes", () => {
    for (let n = 0; n <= 300; n++) {
      const bytes = randomBytes(n + 1, n);
      expect(hex(md5(bytes)), `length ${n}`).toBe(createHash("md5").update(bytes).digest("hex"));
    }
  });

  it("gives the same digest however the input is split into chunks", () => {
    const bytes = randomBytes(9, 5000);
    for (const size of [1, 7, 63, 64, 65, 1000]) {
      const hasher = new Md5();
      for (let i = 0; i < bytes.length; i += size) hasher.update(bytes.subarray(i, i + size));
      expect(hex(hasher.digest()), `chunks of ${size}`).toBe(createHash("md5").update(bytes).digest("hex"));
    }
  });
});

describe("hashBytes", () => {
  it.each(HASH_ALGORITHMS.map((a) => a.id))("%s matches node:crypto", async (algorithm) => {
    for (const n of [0, 3, 64, 1000]) {
      const bytes = randomBytes(n + 5, n);
      expect(hex(await hashBytes(bytes, algorithm))).toBe(createHash(NODE_NAMES[algorithm]).update(bytes).digest("hex"));
    }
  });
});

describe("encodeDigest", () => {
  const digest = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01]);

  it("encodes hex and base64", () => {
    expect(encodeDigest(digest, "hex")).toBe("deadbeef01");
    expect(encodeDigest(digest, "HEX")).toBe("DEADBEEF01");
    expect(encodeDigest(digest, "base64")).toBe(Buffer.from(digest).toString("base64"));
  });
});

describe("digestMatches", () => {
  const digest = md5(utf8("abc"));

  it("accepts hex in any case, with spaces or colons, and base64", () => {
    expect(digestMatches(digest, "900150983cd24fb0d6963f7d28e17f72")).toBe(true);
    expect(digestMatches(digest, "  900150983CD24FB0D6963F7D28E17F72 \n")).toBe(true);
    expect(digestMatches(digest, "90:01:50:98:3c:d2:4f:b0:d6:96:3f:7d:28:e1:7f:72")).toBe(true);
    expect(digestMatches(digest, Buffer.from(digest).toString("base64"))).toBe(true);
  });

  it("accepts sha256sum-style lines", () => {
    expect(digestMatches(digest, "900150983cd24fb0d6963f7d28e17f72  file.txt")).toBe(true);
  });

  it("rejects other digests", () => {
    expect(digestMatches(digest, "900150983cd24fb0d6963f7d28e17f73")).toBe(false);
    expect(digestMatches(digest, "nope")).toBe(false);
  });
});

describe("hashAll", () => {
  it("returns every digest and reports progress for large input", async () => {
    const bytes = randomBytes(4, 20 * 1024 * 1024);
    const progress: number[] = [];
    const digests = await hashAll(bytes, (f) => progress.push(f));
    for (const { id } of HASH_ALGORITHMS) {
      expect(hex(digests[id]), id).toBe(createHash(NODE_NAMES[id]).update(bytes).digest("hex"));
    }
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });
});

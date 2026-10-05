import { bytesToBase64 } from "@/lib/encoding/base64";

export type HashAlgorithm = "md5" | "sha1" | "sha256";

export const HASH_ALGORITHMS: readonly { id: HashAlgorithm; label: string; note?: string }[] = [
  { id: "md5", label: "MD5", note: "Broken for security; fine for checksums." },
  { id: "sha1", label: "SHA-1", note: "Broken for security; fine for checksums." },
  { id: "sha256", label: "SHA-256" },
];

export type DigestEncoding = "hex" | "HEX" | "base64";

// Per-round shift amounts and sine-derived constants from RFC 1321.
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** Incremental MD5 (RFC 1321). Web Crypto has no MD5, and incremental hashing lets large files be fed in chunks. */
export class Md5 {
  private state = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
  private buffer = new Uint8Array(64);
  private buffered = 0;
  private length = 0;
  private words = new Uint32Array(16);

  update(bytes: Uint8Array): this {
    let i = 0;
    this.length += bytes.length;
    if (this.buffered) {
      const take = Math.min(64 - this.buffered, bytes.length);
      this.buffer.set(bytes.subarray(0, take), this.buffered);
      this.buffered += take;
      i = take;
      if (this.buffered < 64) return this;
      this.block(this.buffer, 0);
      this.buffered = 0;
    }
    for (; i + 64 <= bytes.length; i += 64) this.block(bytes, i);
    this.buffer.set(bytes.subarray(i));
    this.buffered = bytes.length - i;
    return this;
  }

  digest(): Uint8Array {
    const bits = this.length * 8;
    const padding = new Uint8Array((this.buffered < 56 ? 56 : 120) - this.buffered + 8);
    padding[0] = 0x80;
    const view = new DataView(padding.buffer);
    view.setUint32(padding.length - 8, bits >>> 0, true);
    view.setUint32(padding.length - 4, Math.floor(bits / 2 ** 32), true);
    this.update(padding);
    const out = new Uint8Array(16);
    const outView = new DataView(out.buffer);
    this.state.forEach((word, i) => outView.setUint32(i * 4, word, true));
    return out;
  }

  private block(bytes: Uint8Array, offset: number) {
    const x = this.words;
    for (let i = 0; i < 16; i++) {
      const o = offset + i * 4;
      x[i] = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24);
    }
    let [a, b, c, d] = this.state;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) [f, g] = [(b & c) | (~b & d), i];
      else if (i < 32) [f, g] = [(d & b) | (~d & c), (5 * i + 1) % 16];
      else if (i < 48) [f, g] = [b ^ c ^ d, (3 * i + 5) % 16];
      else [f, g] = [c ^ (b | ~d), (7 * i) % 16];
      const sum = (a + f + K[i] + x[g]) | 0;
      const shift = S[(i >> 4) * 4 + (i % 4)];
      [a, d, c] = [d, c, b];
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
    }
    this.state[0] += a;
    this.state[1] += b;
    this.state[2] += c;
    this.state[3] += d;
  }
}

export function md5(bytes: Uint8Array): Uint8Array {
  return new Md5().update(bytes).digest();
}

const SUBTLE_NAMES: Record<Exclude<HashAlgorithm, "md5">, string> = { sha1: "SHA-1", sha256: "SHA-256" };

export async function hashBytes(bytes: Uint8Array, algorithm: HashAlgorithm): Promise<Uint8Array> {
  if (algorithm === "md5") return md5(bytes);
  return new Uint8Array(await crypto.subtle.digest(SUBTLE_NAMES[algorithm], bytes as Uint8Array<ArrayBuffer>));
}

export function encodeDigest(digest: Uint8Array, encoding: DigestEncoding): string {
  if (encoding === "base64") return bytesToBase64(digest);
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  return encoding === "HEX" ? hex.toUpperCase() : hex;
}

/**
 * True when `expected` is this digest, written as hex (any case, spaces or colons allowed) or base64.
 * Also accepts `sha256sum`-style "digest  filename" lines.
 */
export function digestMatches(digest: Uint8Array, expected: string): boolean {
  const first = expected.trim().split(/\s{2,}|\t/)[0].trim();
  const hex = first.replace(/[\s:]/g, "").toLowerCase();
  if (hex === encodeDigest(digest, "hex")) return true;
  return first === encodeDigest(digest, "base64");
}

const CHUNK = 8 * 1024 * 1024;

/**
 * Every algorithm's digest of `bytes`. MD5 runs on the main thread, so it's fed in chunks with a pause
 * between each to keep the page responsive; `onProgress` gets the fraction done.
 */
export async function hashAll(bytes: Uint8Array, onProgress?: (fraction: number) => void): Promise<Record<HashAlgorithm, Uint8Array>> {
  const shas = Promise.all([hashBytes(bytes, "sha1"), hashBytes(bytes, "sha256")]);
  const hasher = new Md5();
  for (let i = 0; i < bytes.length; i += CHUNK) {
    hasher.update(bytes.subarray(i, i + CHUNK));
    if (bytes.length > CHUNK) {
      onProgress?.(Math.min(1, (i + CHUNK) / bytes.length));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  const [sha1, sha256] = await shas;
  return { md5: hasher.digest(), sha1, sha256 };
}

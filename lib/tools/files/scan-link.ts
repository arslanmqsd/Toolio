/**
 * The link between a phone that scans and the computer that makes the PDF. The computer makes a session: an id
 * that names a Supabase Realtime channel, and a key that never leaves the link's #fragment (browsers don't send
 * fragments to servers). Photos are sealed with that key (AES-256-GCM) before they're sent, so the relay only
 * ever carries scrambled bytes, and a message from anyone without the key fails to open and is dropped.
 */

export interface ScanSession {
  /** Names the channel; 128 random bits, base64url. */
  id: string;
  /** AES-256 key, base64url. */
  key: string;
}

/** Realtime refuses messages over about 250 KB; base64 pieces this size stay well clear. Divisible by 4 so pieces join cleanly. */
export const PART_CHARS = 180_000;

/** A photo needing more pieces than this (about 13 MB) is refused rather than collected. */
export const MAX_PARTS = 75;

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  return fromBase64(text.replace(/-/g, "+").replace(/_/g, "/"));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // In slices: spreading a whole photo into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export const newSession = (): ScanSession => ({ id: toBase64Url(random(16)), key: toBase64Url(random(32)) });

/** The page a phone opens, with the session in the fragment. */
export const sessionLink = (pageUrl: string, { id, key }: ScanSession) => `${pageUrl.split("#")[0]}#scan=${id}.${key}`;

/** The session in a link's fragment ("#scan=id.key"), or null when there's none or it's malformed. */
export function parseSession(hash: string): ScanSession | null {
  const m = /^#?scan=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(hash);
  return m ? { id: m[1], key: m[2] } : null;
}

export const channelName = (id: string) => `scan-${id}`;

const importKey = (key: string) => crypto.subtle.importKey("raw", fromBase64Url(key) as Uint8Array<ArrayBuffer>, "AES-GCM", false, ["encrypt", "decrypt"]);

/** `data` encrypted with the session key: a fresh 12-byte IV, then the ciphertext and tag. */
export async function seal(key: string, data: Uint8Array): Promise<Uint8Array> {
  const iv = random(12);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(key), data as Uint8Array<ArrayBuffer>));
  const out = new Uint8Array(12 + sealed.length);
  out.set(iv);
  out.set(sealed, 12);
  return out;
}

/** The data `seal` sealed. Rejects when the key is wrong or the bytes were changed on the way. */
export async function unseal(key: string, sealed: Uint8Array): Promise<Uint8Array> {
  if (sealed.length < 28) throw new Error("too short");
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.subarray(0, 12) as Uint8Array<ArrayBuffer> }, await importKey(key), sealed.subarray(12) as Uint8Array<ArrayBuffer>));
}

/** One piece of a sealed photo, as sent over the channel. */
export interface Part {
  photo: string;
  index: number;
  total: number;
  data: string;
}

/** A photo sealed with the key and cut into parts. */
export async function toParts(key: string, photo: string, bytes: Uint8Array): Promise<Part[]> {
  const text = toBase64(await seal(key, bytes));
  const total = Math.max(1, Math.ceil(text.length / PART_CHARS));
  return Array.from({ length: total }, (_, index) => ({ photo, index, total, data: text.slice(index * PART_CHARS, (index + 1) * PART_CHARS) }));
}

/**
 * Collects parts as they arrive, in any order. `add` gives the sealed photo's bytes once its last part is in,
 * and null until then or for a part that doesn't fit (bad numbers, too many parts, or a repeat).
 */
export function partCollector() {
  const photos = new Map<string, (string | undefined)[]>();
  return {
    add(part: Part): Uint8Array | null {
      const { photo, index, total, data } = part ?? {};
      if (typeof photo !== "string" || typeof data !== "string" || !Number.isInteger(total) || !Number.isInteger(index)) return null;
      if (total < 1 || total > MAX_PARTS || index < 0 || index >= total || data.length > PART_CHARS) return null;
      let parts = photos.get(photo);
      if (!parts) photos.set(photo, (parts = new Array(total)));
      if (parts.length !== total || parts[index] !== undefined) return null;
      parts[index] = data;
      if (parts.includes(undefined)) return null;
      photos.delete(photo);
      try {
        return fromBase64(parts.join(""));
      } catch {
        return null;
      }
    },
  };
}

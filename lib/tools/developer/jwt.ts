export type JwtPart = "header" | "payload";

export interface DecodedJwt {
  header: unknown;
  payload: unknown;
  signature: string;
}

export type DecodeResult =
  | { ok: true; jwt: DecodedJwt }
  | { ok: false; error: string };

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** Decodes a base64url string (no padding required) into UTF-8 text. */
export function base64UrlDecode(input: string): string {
  if (!BASE64URL.test(input)) {
    throw new Error("contains characters that are not valid base64url");
  }
  if (input.length % 4 === 1) {
    throw new Error("has an invalid base64url length");
  }
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("is not valid UTF-8");
  }
}

function decodePart(segment: string, part: JwtPart): unknown {
  if (segment === "") {
    throw new Error(`The ${part} segment is empty.`);
  }
  let text: string;
  try {
    text = base64UrlDecode(segment);
  } catch (err) {
    throw new Error(`The ${part} ${(err as Error).message}.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The ${part} decoded, but is not valid JSON.`);
  }
}

export function decodeJwt(token: string): DecodeResult {
  const trimmed = token.trim().replace(/^Bearer\s+/i, "");
  if (trimmed === "") {
    return { ok: false, error: "Token is empty." };
  }
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: `A JWT has 3 dot-separated segments (header.payload.signature); this token has ${parts.length}.`,
    };
  }
  const [headerSegment, payloadSegment, signature] = parts;
  try {
    return {
      ok: true,
      jwt: {
        header: decodePart(headerSegment, "header"),
        payload: decodePart(payloadSegment, "payload"),
        signature,
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type ExpiryInfo =
  | { kind: "none" }
  | { kind: "invalid"; value: unknown }
  | { kind: "valid"; expiresAt: Date };

/** Reads the `exp` claim (seconds since epoch) from a decoded payload. */
export function getExpiry(payload: unknown): ExpiryInfo {
  if (typeof payload !== "object" || payload === null || !("exp" in payload)) {
    return { kind: "none" };
  }
  const exp = (payload as { exp: unknown }).exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    return { kind: "invalid", value: exp };
  }
  return { kind: "valid", expiresAt: new Date(exp * 1000) };
}

/** Formats a duration as its two largest units, e.g. "2d 4h", "5m 12s". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const units: [string, number][] = [
    ["d", Math.floor(totalSeconds / 86400)],
    ["h", Math.floor((totalSeconds % 86400) / 3600)],
    ["m", Math.floor((totalSeconds % 3600) / 60)],
    ["s", totalSeconds % 60],
  ];
  const first = units.findIndex(([, value]) => value > 0);
  if (first === -1) return "0s";
  return units
    .slice(first, first + 2)
    .filter(([, value]) => value > 0)
    .map(([unit, value]) => `${value}${unit}`)
    .join(" ");
}

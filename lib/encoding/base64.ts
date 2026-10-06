/** Base64 and Base64URL (RFC 4648) for any bytes, not just Latin-1 strings like btoa/atob. */

export interface EncodeOptions {
  /** Base64URL: "-" and "_" instead of "+" and "/". */
  urlSafe?: boolean;
  /** Pad with "=" to a multiple of 4 characters. Default true. */
  padding?: boolean;
}

export type Base64Variant = "standard" | "url-safe";

export type DecodeResult =
  /** `variant` is null when the text has none of + / - _, so reads the same either way. */
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; variant: Base64Variant | null; padded: boolean }
  | { ok: false; error: string; /** Index in the input of the offending character. */ offset: number };

// String.fromCharCode(...chunk) has an argument limit, so large inputs go through in slices.
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array, { urlSafe = false, padding = true }: EncodeOptions = {}): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  let out = btoa(binary);
  if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_");
  if (!padding) out = out.replace(/=+$/, "");
  return out;
}

export function textToBase64(text: string, options?: EncodeOptions): string {
  return bytesToBase64(new TextEncoder().encode(text), options);
}

/**
 * Decodes standard Base64 or Base64URL, telling them apart by their characters. Padding is optional
 * and whitespace (as in MIME or PEM line wrapping) is ignored.
 */
export function base64ToBytes(input: string): DecodeResult {
  let standard = -1;
  let urlSafe = -1;
  let padStart = -1;
  let clean = "";
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === " " || char === "\n" || char === "\r" || char === "\t") continue;
    if (char === "=") {
      if (padStart === -1) padStart = i;
      continue;
    }
    if (padStart !== -1) return { ok: false, error: '"=" padding can only come at the end.', offset: padStart };
    if (char === "+" || char === "/") {
      if (urlSafe !== -1) return mixed(i);
      standard = i;
    } else if (char === "-" || char === "_") {
      if (standard !== -1) return mixed(i);
      urlSafe = i;
    } else if (!/[A-Za-z0-9]/.test(char)) {
      return { ok: false, error: `"${char}" isn't a Base64 character.`, offset: i };
    }
    clean += char;
  }

  const padding = padStart === -1 ? 0 : input.slice(padStart).replace(/\s/g, "").length;
  if (clean.length % 4 === 1) {
    return { ok: false, error: "The length is wrong: one character too many or too few. Part of it may be missing.", offset: input.length };
  }
  if (padding > 0 && (clean.length + padding) % 4 !== 0) {
    return { ok: false, error: "The amount of \"=\" padding doesn't fit the length.", offset: padStart };
  }

  const base64 = urlSafe !== -1 ? clean.replace(/-/g, "+").replace(/_/g, "/") : clean;
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { ok: true, bytes, variant: urlSafe !== -1 ? "url-safe" : standard !== -1 ? "standard" : null, padded: padding > 0 };
}

function mixed(offset: number): DecodeResult {
  return { ok: false, error: "This mixes standard Base64 (+ /) and URL-safe Base64 (- _) characters.", offset };
}

/** UTF-8 text, or null when the bytes aren't valid UTF-8 (so are probably binary). */
export function bytesToText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Breaks Base64 into lines of `width` characters, like MIME (76) or PEM (64). */
export function wrapLines(text: string, width: number): string {
  if (width <= 0 || text.length <= width) return text;
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines.join("\n");
}

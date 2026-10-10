import { bytesToText } from "@/lib/encoding/base64";

const MB = 1024 * 1024;
/** Bytes checked for a NUL byte, which text files don't contain. */
const SNIFF_BYTES = 8192;

/** Why a file can't be read as text, or null when it can. `head` is the file's first bytes. */
export function checkTextFile(size: number, head: Uint8Array, maxBytes: number): string | null {
  if (size > maxBytes) return `This file is over ${Math.round(maxBytes / MB)} MB.`;
  if (head.includes(0)) return "This looks like a binary file, not text.";
  return null;
}

export type TextEncodingName = "utf-8" | "windows-1252";

/**
 * UTF-8 text, or, when the bytes aren't valid UTF-8, Windows-1252: what Excel and older Windows
 * programs save in, and a superset of Latin-1, so every byte decodes to something.
 */
export function decodeTextBytes(bytes: Uint8Array): { text: string; encoding: TextEncodingName } {
  const utf8 = bytesToText(bytes);
  return utf8 === null ? { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" } : { text: utf8, encoding: "utf-8" };
}

/**
 * Reads a dropped or chosen file as UTF-8 text, refusing large and binary files. With
 * `legacyFallback`, a file that isn't valid UTF-8 is read as Windows-1252 instead of getting U+FFFD.
 */
export async function readTextFile(
  file: File,
  maxBytes: number,
  { legacyFallback = false } = {},
): Promise<{ ok: true; text: string; encoding: TextEncodingName } | { ok: false; error: string }> {
  try {
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const error = checkTextFile(file.size, head, maxBytes);
    if (error) return { ok: false, error };
    if (!legacyFallback) return { ok: true, text: await file.text(), encoding: "utf-8" };
    return { ok: true, ...decodeTextBytes(new Uint8Array(await file.arrayBuffer())) };
  } catch {
    return { ok: false, error: "The browser couldn't read this file." };
  }
}

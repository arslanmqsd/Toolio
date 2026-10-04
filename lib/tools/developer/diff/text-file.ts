const MB = 1024 * 1024;
/** Bytes checked for a NUL byte, which text files don't contain. */
const SNIFF_BYTES = 8192;

/** Why a file can't be read as text, or null when it can. `head` is the file's first bytes. */
export function checkTextFile(size: number, head: Uint8Array, maxBytes: number): string | null {
  if (size > maxBytes) return `This file is over ${Math.round(maxBytes / MB)} MB.`;
  if (head.includes(0)) return "This looks like a binary file, not text.";
  return null;
}

/** Reads a dropped or chosen file as UTF-8 text, refusing large and binary files. */
export async function readTextFile(
  file: File,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const error = checkTextFile(file.size, head, maxBytes);
    return error ? { ok: false, error } : { ok: true, text: await file.text() };
  } catch {
    return { ok: false, error: "The browser couldn't read this file." };
  }
}

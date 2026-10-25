/** Lowercase hex for any bytes. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Bytes from hex, ignoring whitespace; null when it isn't whole bytes of hex. */
export function hexToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text.replace(/\s/g, "");
  if (!clean || clean.length % 2 || /[^0-9a-f]/i.test(clean)) return null;
  return Uint8Array.from(clean.match(/../g)!, (h) => parseInt(h, 16));
}

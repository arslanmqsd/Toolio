import { base64ToBytes } from "./base64";
import { hexToBytes } from "./hex";

/** How a typed secret becomes key bytes: as UTF-8 text, or decoded from Base64 or hex. */
export type KeyFormat = "text" | "base64" | "hex";

const utf8 = (text: string) => new TextEncoder().encode(text);

/** The secret's key bytes, or null when it isn't valid in `format` or is empty. */
export function keyBytes(secret: string, format: KeyFormat): Uint8Array<ArrayBuffer> | null {
  if (format === "text") return secret ? utf8(secret) : null;
  if (format === "hex") return hexToBytes(secret);
  const decoded = base64ToBytes(secret.trim());
  return decoded.ok && decoded.bytes.length > 0 ? decoded.bytes : null;
}

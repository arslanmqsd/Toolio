/** Helpers for the Base64 tool: data URLs, recognising decoded files, and a hex peek at binary. */

export interface DataUrl {
  mimeType: string;
  base64: string;
}

/** Splits a "data:<type>;base64,<data>" URL. Null for anything else, including non-Base64 data URLs. */
export function parseDataUrl(text: string): DataUrl | null {
  const match = text.trim().match(/^data:([^,;]*)((?:;[^,;]*)*);base64,/i);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase() || "application/octet-stream", base64: text.trim().slice(match[0].length) };
}

export function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType || "application/octet-stream"};base64,${base64}`;
}

export interface FileKind {
  label: string;
  mimeType: string;
  extension: string;
  /** Safe to show in an <img>: raster formats only, so nothing in it can run. */
  previewable: boolean;
  /** Recognised from its bytes as a binary format, so never shown as text. */
  binary: boolean;
}

const SIGNATURES: { bytes: (number | null)[]; kind: FileKind }[] = [
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], kind: { label: "PNG image", mimeType: "image/png", extension: "png", previewable: true, binary: true } },
  { bytes: [0xff, 0xd8, 0xff], kind: { label: "JPEG image", mimeType: "image/jpeg", extension: "jpg", previewable: true, binary: true } },
  { bytes: [0x47, 0x49, 0x46, 0x38], kind: { label: "GIF image", mimeType: "image/gif", extension: "gif", previewable: true, binary: true } },
  {
    // "RIFF" <size> "WEBP"
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
    kind: { label: "WebP image", mimeType: "image/webp", extension: "webp", previewable: true, binary: true },
  },
  { bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], kind: { label: "PDF document", mimeType: "application/pdf", extension: "pdf", previewable: false, binary: true } },
  { bytes: [0x50, 0x4b, 0x03, 0x04], kind: { label: "ZIP archive", mimeType: "application/zip", extension: "zip", previewable: false, binary: true } },
  { bytes: [0x1f, 0x8b], kind: { label: "Gzip archive", mimeType: "application/gzip", extension: "gz", previewable: false, binary: true } },
  { bytes: [0x00, 0x61, 0x73, 0x6d], kind: { label: "WebAssembly module", mimeType: "application/wasm", extension: "wasm", previewable: false, binary: true } },
];

const UNKNOWN: FileKind = { label: "Binary data", mimeType: "application/octet-stream", extension: "bin", previewable: false, binary: false };

/** What a decoded file is, from its first bytes. Falls back to a data URL's stated type, then "Binary data". */
export function detectFileKind(bytes: Uint8Array, statedMimeType?: string): FileKind {
  const found = SIGNATURES.find(({ bytes: sig }) => sig.length <= bytes.length && sig.every((b, i) => b === null || bytes[i] === b));
  if (found) return found.kind;
  if (statedMimeType && statedMimeType !== UNKNOWN.mimeType) {
    const subtype = statedMimeType.split("/")[1]?.split("+")[0].replace(/[^a-z0-9]/g, "") || "bin";
    return { label: statedMimeType, mimeType: statedMimeType, extension: subtype, previewable: false, binary: false };
  }
  return UNKNOWN;
}

/** "89 50 4E 47 …" rows of 16 bytes with an offset column, like a hex editor. */
export function hexDump(bytes: Uint8Array, maxBytes: number): string {
  const rows: string[] = [];
  const end = Math.min(bytes.length, maxBytes);
  for (let offset = 0; offset < end; offset += 16) {
    const row = bytes.subarray(offset, Math.min(offset + 16, end));
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    const ascii = Array.from(row, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
    rows.push(`${offset.toString(16).padStart(8, "0")}  ${hex.padEnd(47)}  ${ascii}`);
  }
  return rows.join("\n");
}

/** File name for a download: the original name's stem when there is one, with the right extension. */
export function downloadName(extension: string, sourceName?: string): string {
  const stem = sourceName?.replace(/\.[^.]*$/, "") || "decoded";
  return `${stem}.${extension}`;
}

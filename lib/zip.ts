/**
 * Writes a ZIP archive without compression ("stored"). Fine for files that are already compressed,
 * like PNG, JPEG or PDF, where deflate would gain almost nothing. No ZIP64, so under 4 GB and 65,535 files.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** CRC-32 (the one ZIP, PNG and gzip use). */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 00:00, the earliest DOS date: entries carry no real timestamp. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
/** Bit 11: names are UTF-8. */
const UTF8_FLAG = 0x0800;

export function zipStore(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const names = entries.map((e) => encoder.encode(e.name));
  const localSize = entries.reduce((sum, e, i) => sum + 30 + names[i].length + e.data.length, 0);
  const centralSize = names.reduce((sum, n) => sum + 46 + n.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  const crcs = entries.map((e) => crc32(e.data));
  let at = 0;

  entries.forEach((entry, i) => {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true); // local file header
    view.setUint16(at + 4, 20, true); // version needed: 2.0
    view.setUint16(at + 6, UTF8_FLAG, true);
    view.setUint16(at + 8, 0, true); // method: stored
    view.setUint16(at + 10, 0, true); // time
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, crcs[i], true);
    view.setUint32(at + 18, entry.data.length, true); // compressed size
    view.setUint32(at + 22, entry.data.length, true); // uncompressed size
    view.setUint16(at + 26, names[i].length, true);
    view.setUint16(at + 28, 0, true); // extra field length
    out.set(names[i], at + 30);
    out.set(entry.data, at + 30 + names[i].length);
    at += 30 + names[i].length + entry.data.length;
  });

  const centralStart = at;
  entries.forEach((entry, i) => {
    view.setUint32(at, 0x02014b50, true); // central directory header
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 20, true); // version needed
    view.setUint16(at + 8, UTF8_FLAG, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, 0, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, crcs[i], true);
    view.setUint32(at + 20, entry.data.length, true);
    view.setUint32(at + 24, entry.data.length, true);
    view.setUint16(at + 28, names[i].length, true);
    // Extra and comment lengths, disk number, internal and external attributes: all zero.
    view.setUint32(at + 42, offsets[i], true);
    out.set(names[i], at + 46);
    at += 46 + names[i].length;
  });

  view.setUint32(at, 0x06054b50, true); // end of central directory
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, at - centralStart, true);
  view.setUint32(at + 16, centralStart, true);
  return out;
}

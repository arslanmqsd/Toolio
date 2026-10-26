import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "./zip";

const text = (s: string) => new TextEncoder().encode(s);

/** Reads a stored ZIP back through its central directory, the way unzip tools do. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files: { name: string; data: string; crc: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    const local = view.getUint32(at + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files.push({ name, data: new TextDecoder().decode(zip.subarray(start, start + size)), crc: view.getUint32(at + 16, true) });
    at += 46 + nameLength;
  }
  return files;
}

describe("crc32", () => {
  it("matches the standard check values", () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(text("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
  });
});

describe("zipStore", () => {
  it("round-trips several files in order", () => {
    const files = readZip(zipStore([
      { name: "a.txt", data: text("first") },
      { name: "b/c.txt", data: text("second file") },
    ]));
    expect(files.map(({ name, data }) => ({ name, data }))).toEqual([
      { name: "a.txt", data: "first" },
      { name: "b/c.txt", data: "second file" },
    ]);
  });

  it("stores each file's CRC", () => {
    const [file] = readZip(zipStore([{ name: "n.txt", data: text("123456789") }]));
    expect(file.crc).toBe(0xcbf43926);
  });

  it("keeps non-ASCII names, flagged as UTF-8", () => {
    const zip = zipStore([{ name: "résumé-页.png", data: text("x") }]);
    expect(readZip(zip)[0].name).toBe("résumé-页.png");
    expect(new DataView(zip.buffer).getUint16(6, true) & 0x0800).toBe(0x0800);
  });

  it("handles empty files and an empty archive", () => {
    expect(readZip(zipStore([{ name: "empty", data: new Uint8Array() }]))).toEqual([{ name: "empty", data: "", crc: 0 }]);
    const empty = zipStore([]);
    expect(empty.length).toBe(22);
    expect(readZip(empty)).toEqual([]);
  });

  it("stores bytes unchanged, including binary data", () => {
    const data = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) & 0xff);
    const zip = zipStore([{ name: "bin", data }]);
    expect(zip.subarray(30 + 3, 30 + 3 + data.length)).toEqual(data);
    expect(zip.length).toBe(30 + 3 + 1000 + 46 + 3 + 22);
  });
});

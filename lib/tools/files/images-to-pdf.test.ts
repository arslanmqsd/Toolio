import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { crc32 } from "@/lib/zip";
import { imagesToPdf, jpegOrientation, placeImage, sniffImage } from "./images-to-pdf";

/** A 3 × 2 red JPEG, saved by macOS (it carries an EXIF block with no orientation tag). */
const JPEG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAA6ADAAQAAAABAAAAAgAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAgADAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+Q6KKK/Cz/VQ/9k=", "base64"));

/** A solid-red RGB PNG of any size. */
function png(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.from([0, ...Array(width).fill([200, 30, 30]).flat()])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

/** A minimal JPEG start with an EXIF block holding just an orientation tag. */
function exifJpeg(orientation: number, little: boolean): Uint8Array {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  const u16 = (v: number, at: number) => (little ? tiff.writeUInt16LE(v, at) : tiff.writeUInt16BE(v, at));
  const u32 = (v: number, at: number) => (little ? tiff.writeUInt32LE(v, at) : tiff.writeUInt32BE(v, at));
  tiff.write(little ? "II" : "MM", 0, "latin1");
  u16(42, 2);
  u32(8, 4);
  u16(1, 8);
  u16(0x0112, 10);
  u16(3, 12);
  u32(1, 14);
  u16(orientation, 18);
  const app1 = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(app1.length + 2);
  // A JFIF APP0 first, as most cameras and editors write one, then APP1, then start of scan.
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, Buffer.from([0xff, 0xe1]), length, app1, Buffer.from([0xff, 0xda, 0x00, 0x02])]);
}

const pageSizes = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);

describe("sniffImage", () => {
  it("knows JPEG and PNG by their first bytes", () => {
    expect(sniffImage(JPEG)).toBe("jpg");
    expect(sniffImage(png(1, 1))).toBe("png");
  });

  it("returns null for other formats and short files", () => {
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("RIFF....WEBP"))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("jpegOrientation", () => {
  it("reads the tag in both byte orders", () => {
    expect(jpegOrientation(exifJpeg(6, false))).toBe(6);
    expect(jpegOrientation(exifJpeg(8, true))).toBe(8);
    expect(jpegOrientation(exifJpeg(1, true))).toBe(1);
  });

  it("treats a JPEG without the tag as upright", () => {
    expect(jpegOrientation(JPEG)).toBe(1);
  });

  it("ignores out-of-range values and cut-off files", () => {
    expect(jpegOrientation(exifJpeg(9, false))).toBe(1);
    expect(jpegOrientation(exifJpeg(6, false).subarray(0, 20))).toBe(1);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8]))).toBe(1);
  });
});

describe("placeImage", () => {
  it("makes the page the image's size at 96 pixels to the inch, plus margins", () => {
    expect(placeImage(960, 480, { size: "image", margin: 0 })).toEqual({ pageWidth: 720, pageHeight: 360, x: 0, y: 0, width: 720, height: 360 });
    expect(placeImage(96, 96, { size: "image", margin: 18 })).toEqual({ pageWidth: 108, pageHeight: 108, x: 18, y: 18, width: 72, height: 72 });
  });

  it("fits a tall image to the width of portrait paper, centred", () => {
    const p = placeImage(1000, 1000, { size: "letter", margin: 0 });
    expect([p.pageWidth, p.pageHeight]).toEqual([612, 792]);
    expect([p.width, p.height, p.x, p.y]).toEqual([612, 612, 0, 90]);
  });

  it("turns paper sideways for wide images", () => {
    const p = placeImage(4000, 3000, { size: "a4", margin: 36 });
    expect([p.pageWidth, p.pageHeight]).toEqual([841.89, 595.28]);
    expect(p.height).toBeCloseTo(595.28 - 72);
    expect(p.y).toBeCloseTo(36);
    expect(p.x + p.width / 2).toBeCloseTo(841.89 / 2);
  });

  it("scales small images up to fill the page", () => {
    const p = placeImage(10, 20, { size: "letter", margin: 0 });
    expect(p.height).toBeCloseTo(792);
    expect(p.width).toBeCloseTo(396);
  });
});

describe("imagesToPdf", () => {
  it("makes one page per image, in order", async () => {
    const out = await imagesToPdf(
      [
        { bytes: png(96, 192), type: "png" },
        { bytes: JPEG, type: "jpg" },
        { bytes: png(192, 96), type: "png" },
      ],
      { size: "image", margin: 0 },
    );
    expect(await pageSizes(out)).toEqual([[72, 144], [2, 2], [144, 72]]);
  });

  it("uses paper sizes when asked", async () => {
    const out = await imagesToPdf([{ bytes: png(30, 40), type: "png" }, { bytes: png(40, 30), type: "png" }], { size: "a4", margin: 18 });
    expect(await pageSizes(out)).toEqual([[595, 842], [842, 595]]);
  });

  it("reports progress, then saving", async () => {
    const seen: string[] = [];
    await imagesToPdf([{ bytes: png(2, 2), type: "png" }, { bytes: JPEG, type: "jpg" }], { size: "image", margin: 0 }, (p) =>
      seen.push(p.phase === "saving" ? "saving" : `${p.done}/${p.total}`),
    );
    expect(seen).toEqual(["0/2", "1/2", "saving"]);
  });

  it("refuses an empty list and unreadable images", async () => {
    await expect(imagesToPdf([], { size: "image", margin: 0 })).rejects.toThrow("at least one image");
    await expect(imagesToPdf([{ bytes: new TextEncoder().encode("nope"), type: "png" }], { size: "image", margin: 0 })).rejects.toThrow();
  });
});

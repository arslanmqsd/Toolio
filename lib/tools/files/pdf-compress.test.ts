import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { LEVELS, compressPdf, type JpegEncoder } from "./pdf-compress";

/** Just enough of a JPEG for pdf-lib to read its size: SOI, a baseline SOF0 header, padding, EOI. */
function fakeJpeg(width: number, height: number, components = 3, padding = 20_000): Uint8Array {
  const specs = Array.from({ length: components }, (_, i) => [i + 1, 0x11, 0]).flat();
  const sof = [0xff, 0xc0, 0x00, 8 + 3 * components, 8, height >> 8, height & 255, width >> 8, width & 255, components, ...specs];
  return new Uint8Array([0xff, 0xd8, ...sof, ...new Array(padding).fill(0), 0xff, 0xd9]);
}

async function pdfWithImage(width: number, height: number, components = 3) {
  const doc = await PDFDocument.create();
  const image = await doc.embedJpg(fakeJpeg(width, height, components));
  doc.addPage().drawImage(image, { x: 0, y: 0, width: 200, height: 100 });
  doc.addPage().drawText("Hello");
  return doc.save();
}

/** Changes the first image's dictionary, e.g. to give it a colour space embedJpg wouldn't. */
async function editImage(bytes: Uint8Array, edit: (doc: PDFDocument, image: PDFRawStream) => void) {
  const doc = await PDFDocument.load(bytes);
  const [, image] = doc.context.enumerateIndirectObjects().find(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"))!;
  edit(doc, image as PDFRawStream);
  return doc.save();
}

/** Records what the encoder was asked to do, and returns a small JPEG. */
function spyEncoder() {
  const calls: { width: number; height: number; quality: number }[] = [];
  const encode: JpegEncoder = async (_, target) => (calls.push(target), new Uint8Array(500).fill(7));
  return { calls, encode };
}

async function imageDicts(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .map(([, o]) => o)
    .filter((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
}

describe("compressPdf", () => {
  it("swaps in a smaller, scaled-down JPEG and keeps the pages", async () => {
    const targets: { width: number; height: number; quality: number }[] = [];
    const encode: JpegEncoder = async (_, target) => (targets.push(target), new Uint8Array(500).fill(7));

    const input = await pdfWithImage(4000, 2000);
    const result = await compressPdf(input, LEVELS.medium, encode);

    expect(targets).toEqual([{ width: 1600, height: 800, quality: 0.65 }]);
    expect(result).toMatchObject({ images: 1, recompressed: 1 });
    expect(result.bytes.length).toBeLessThan(input.length);

    const [image] = await imageDicts(result.bytes);
    expect((image.dict.get(PDFName.of("Width")) as PDFNumber).asNumber()).toBe(1600);
    expect(image.contents.length).toBe(500);
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2);
  });

  it("keeps the original image when re-encoding doesn't help or fails", async () => {
    const input = await pdfWithImage(800, 600);
    for (const encode of [async () => null, async () => new Uint8Array(50_000)] as JpegEncoder[]) {
      const result = await compressPdf(input, LEVELS.strong, encode);
      expect(result).toMatchObject({ images: 1, recompressed: 0 });
      const [image] = await imageDicts(result.bytes);
      expect(image.contents.length).toBeGreaterThan(20_000);
    }
  });

  it("rejects files that aren't PDFs", async () => {
    await expect(compressPdf(new TextEncoder().encode("hello"), LEVELS.medium, async () => null)).rejects.toThrow();
  });

  it("keeps the size of images already within the limit", async () => {
    const { calls, encode } = spyEncoder();
    await compressPdf(await pdfWithImage(800, 600), LEVELS.light, encode);
    expect(calls).toEqual([{ width: 800, height: 600, quality: 0.8 }]);
  });

  it("scales tall images by their longest side", async () => {
    const { calls, encode } = spyEncoder();
    await compressPdf(await pdfWithImage(1000, 3300), LEVELS.strong, encode);
    expect(calls).toEqual([{ width: 333, height: 1100, quality: 0.45 }]);
  });

  it("recompresses greyscale JPEGs, marking them RGB as the canvas outputs", async () => {
    const result = await compressPdf(await pdfWithImage(500, 500, 1), LEVELS.medium, spyEncoder().encode);
    expect(result.recompressed).toBe(1);
    const [image] = await imageDicts(result.bytes);
    expect(image.dict.get(PDFName.of("ColorSpace"))).toBe(PDFName.of("DeviceRGB"));
  });

  it("skips CMYK JPEGs, whose colours a canvas can't keep", async () => {
    const { calls, encode } = spyEncoder();
    const result = await compressPdf(await pdfWithImage(500, 500, 4), LEVELS.medium, encode);
    expect(calls).toEqual([]);
    expect(result).toMatchObject({ images: 1, recompressed: 0 });
  });

  it("accepts ICC-based RGB but not ICC-based CMYK", async () => {
    for (const [n, expected] of [[3, 1], [4, 0]]) {
      const input = await editImage(await pdfWithImage(500, 500), (doc, image) => {
        const profile = doc.context.register(doc.context.stream(new Uint8Array(10), { N: n }));
        image.dict.set(PDFName.of("ColorSpace"), doc.context.obj([PDFName.of("ICCBased"), profile]));
      });
      expect((await compressPdf(input, LEVELS.medium, spyEncoder().encode)).recompressed).toBe(expected);
    }
  });

  it("skips images with a Decode array or a colour-key mask", async () => {
    for (const key of ["Decode", "Mask"]) {
      const input = await editImage(await pdfWithImage(500, 500), (doc, image) => {
        image.dict.set(PDFName.of(key), doc.context.obj([0, 1, 0, 1, 0, 1]));
      });
      expect((await compressPdf(input, LEVELS.medium, spyEncoder().encode)).recompressed).toBe(0);
    }
  });

  it("counts but leaves alone images that aren't JPEGs", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.context.register(
      doc.context.flateStream(new Uint8Array(30_000), { Type: "XObject", Subtype: "Image", Width: 100, Height: 100, ColorSpace: "DeviceRGB", BitsPerComponent: 8 }),
    );
    const { calls, encode } = spyEncoder();
    expect(await compressPdf(await doc.save(), LEVELS.strong, encode)).toMatchObject({ images: 1, recompressed: 0 });
    expect(calls).toEqual([]);
  });

  it("re-encodes an image used on several pages once", async () => {
    const doc = await PDFDocument.create();
    const image = await doc.embedJpg(fakeJpeg(3000, 2000));
    for (let i = 0; i < 3; i++) doc.addPage().drawImage(image, { x: 0, y: 0 });
    const { calls, encode } = spyEncoder();
    const result = await compressPdf(await doc.save(), LEVELS.medium, encode);
    expect(calls).toHaveLength(1);
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(3);
  });

  it("never returns a file bigger than it was given", async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText("Only text");
    const input = await doc.save({ useObjectStreams: true });
    const result = await compressPdf(input, LEVELS.medium, spyEncoder().encode);
    expect(result.bytes.length).toBeLessThanOrEqual(input.length);
    expect(result.images).toBe(0);
  });
});

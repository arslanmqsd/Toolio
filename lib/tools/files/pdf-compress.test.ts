import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { LEVELS, compressPdf, unpredictPng, type ImageEncoder, type ImageSource } from "./pdf-compress";

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
  const sources: ImageSource[] = [];
  const encode: ImageEncoder = async (source, target) => (sources.push(source), calls.push(target), new Uint8Array(500).fill(7));
  return { calls, sources, encode };
}

/** A PDF with one PNG-style (Flate) image of the given raw samples. */
async function pdfWithFlateImage(samples: Uint8Array, width: number, height: number, extra: Record<string, unknown> = {}) {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.context.register(
    doc.context.flateStream(samples, { Type: "XObject", Subtype: "Image", Width: width, Height: height, ColorSpace: "DeviceRGB", BitsPerComponent: 8, ...extra }),
  );
  return doc.save();
}

/** Compressible RGB samples: a gradient, so a real PNG would be many KB. */
const gradient = (width: number, height: number) => Uint8Array.from({ length: width * height * 3 }, (_, i) => (i * 7) % 256);
const rgbaOf = (source: ImageSource) => (source.kind === "pixels" ? Array.from(source.rgba) : []);

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
    const encode: ImageEncoder = async (_, target) => (targets.push(target), new Uint8Array(500).fill(7));

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
    for (const encode of [async () => null, async () => new Uint8Array(50_000)] as ImageEncoder[]) {
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

  it("decodes PNG-style images to RGBA pixels and swaps in a JPEG", async () => {
    const { calls, sources, encode } = spyEncoder();
    const samples = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30]);
    const result = await compressPdf(await pdfWithFlateImage(samples, 2, 2), LEVELS.medium, encode);

    expect(result).toMatchObject({ images: 1, recompressed: 0 }); // 500-byte JPEG isn't smaller than this tiny image
    expect(calls).toEqual([{ width: 2, height: 2, quality: 0.65 }]);
    expect(rgbaOf(sources[0])).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255]);

    const big = await compressPdf(await pdfWithFlateImage(gradient(400, 400), 400, 400), LEVELS.medium, spyEncoder().encode);
    expect(big.recompressed).toBe(1);
    const [image] = await imageDicts(big.bytes);
    expect(image.dict.get(PDFName.of("Filter"))).toBe(PDFName.of("DCTDecode"));
    expect(image.dict.get(PDFName.of("DecodeParms"))).toBeUndefined();
  });

  it("spreads greyscale samples over all three channels", async () => {
    const { sources, encode } = spyEncoder();
    await compressPdf(await pdfWithFlateImage(Uint8Array.from([0, 128]), 2, 1, { ColorSpace: "DeviceGray" }), LEVELS.medium, encode);
    expect(rgbaOf(sources[0])).toEqual([0, 0, 0, 255, 128, 128, 128, 255]);
  });

  it("undoes PNG predictors before encoding", async () => {
    // Two RGB pixels per row; row 1 uses Sub (each pixel adds the one to its left), row 2 uses Up.
    const predicted = Uint8Array.from([1, 10, 20, 30, 5, 5, 5, 2, 1, 1, 1, 1, 1, 1]);
    const { sources, encode } = spyEncoder();
    await compressPdf(
      await pdfWithFlateImage(predicted, 2, 2, { DecodeParms: { Predictor: 15, Colors: 3, Columns: 2 } }),
      LEVELS.medium,
      encode,
    );
    expect(rgbaOf(sources[0])).toEqual([10, 20, 30, 255, 15, 25, 35, 255, 11, 21, 31, 255, 16, 26, 36, 255]);
  });

  it("skips images it can't decode faithfully", async () => {
    const cases: Record<string, unknown>[] = [
      { BitsPerComponent: 16 },
      { ColorSpace: "DeviceCMYK" },
      { DecodeParms: { Predictor: 2, Colors: 3, Columns: 20 } },
    ];
    for (const extra of cases) {
      const { calls, encode } = spyEncoder();
      const result = await compressPdf(await pdfWithFlateImage(gradient(20, 20), 20, 20, extra), LEVELS.medium, encode);
      expect(calls, JSON.stringify(extra)).toEqual([]);
      expect(result.images).toBe(1);
    }
  });

  it("skips images stored with filters it can't undo", async () => {
    const input = await editImage(await pdfWithFlateImage(gradient(20, 20), 20, 20), (doc, image) => {
      image.dict.set(PDFName.of("Filter"), PDFName.of("JBIG2Decode"));
    });
    const { calls, encode } = spyEncoder();
    expect((await compressPdf(input, LEVELS.medium, encode)).recompressed).toBe(0);
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

  it("reports reading, each image, then saving", async () => {
    const doc = await PDFDocument.create();
    for (const width of [600, 700]) doc.addPage().drawImage(await doc.embedJpg(fakeJpeg(width, 400)), { x: 0, y: 0 });
    const steps: unknown[] = [];
    await compressPdf(await doc.save(), LEVELS.medium, spyEncoder().encode, (progress) => steps.push(progress));
    expect(steps).toEqual([
      { phase: "reading" },
      { phase: "images", done: 0, total: 2 },
      { phase: "images", done: 1, total: 2 },
      { phase: "saving" },
    ]);
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

describe("unpredictPng", () => {
  it("undoes each PNG filter type", () => {
    // One grey sample per pixel, three pixels per row; rows use None, Sub, Up, Average and Paeth.
    const rows = [
      [0, 10, 20, 30],
      [1, 10, 10, 10],
      [2, 1, 1, 1],
      [3, 5, 5, 5],
      [4, 1, 1, 1],
    ];
    expect(Array.from(unpredictPng(Uint8Array.from(rows.flat()), 1, 3))).toEqual([
      10, 20, 30,
      10, 20, 30,
      11, 21, 31,
      10, 20, 30,
      11, 21, 31,
    ]);
  });

  it("wraps around at 256", () => {
    expect(Array.from(unpredictPng(Uint8Array.from([1, 200, 100]), 1, 2))).toEqual([200, 44]);
  });
});

import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, StandardFonts, degrees } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { OCR_LANGUAGES, addTextLayers } from "./pdf-ocr";
import { pageContents } from "./pdf-test-utils";

/** A three-page "scan": pictures only, no text. */
async function scan(rotation = 0) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([600, 800]).setRotation(degrees(rotation));
  return doc.save();
}

/** A stand-in for Tesseract's text-only page: `text` at the top-left of a page `width` × `height` (the page as seen). */
async function layer(text: string, width = 1200, height = 1600) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  page.drawText(text, { x: 100, y: height - 200, size: 40, font: await doc.embedFont(StandardFonts.Helvetica) });
  return doc.save();
}

/** Each page's text as pdf.js reads it, the way readers search and copy it. */
async function texts(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const { items } = await (await doc.getPage(i)).getTextContent();
    out.push(items.map((item) => ("str" in item ? item.str : "")).join(""));
  }
  await doc.destroy();
  return out;
}

/** Where pdf.js places the first piece of a page's text, in points from the page's bottom-left as seen. */
async function firstTextAt(bytes: Uint8Array, page = 1) {
  const doc = await getDocument({ data: bytes.slice() }).promise;
  const p = await doc.getPage(page);
  const viewport = p.getViewport({ scale: 1 });
  const { items } = await p.getTextContent();
  const item = items.find((i) => "str" in i && i.str.trim());
  if (!item || !("transform" in item)) throw new Error("no text");
  const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
  await doc.destroy();
  return [Math.round(x), Math.round(viewport.height - y)];
}

describe("addTextLayers", () => {
  it("makes a page's text readable", async () => {
    const out = await addTextLayers(await scan(), [{ page: 0, pdf: await layer("Invoice 42") }]);
    expect((await texts(out))[0]).toBe("Invoice 42");
  });

  it("keeps every page and leaves pages without a layer alone", async () => {
    const out = await addTextLayers(await scan(), [{ page: 1, pdf: await layer("Middle") }]);
    expect(await texts(out)).toEqual(["", "Middle", ""]);
  });

  it("adds a layer to each listed page", async () => {
    const out = await addTextLayers(await scan(), [
      { page: 0, pdf: await layer("First") },
      { page: 2, pdf: await layer("Last") },
    ]);
    expect(await texts(out)).toEqual(["First", "", "Last"]);
  });

  it("scales the layer to fit the page", async () => {
    // Text 100 pt in and 200 down on a 1200 × 1600 layer is 50 and 100 on the 600 × 800 page.
    const out = await addTextLayers(await scan(), [{ page: 0, pdf: await layer("Scaled") }]);
    expect(await firstTextAt(out)).toEqual([50, 700]);
  });

  it("places text where it's seen on a page turned 90°", async () => {
    // Turned, the page is seen 800 wide and 600 tall, and Tesseract read it that way.
    const out = await addTextLayers(await scan(90), [{ page: 0, pdf: await layer("Turned", 1600, 1200) }]);
    expect((await texts(out))[0]).toBe("Turned");
    expect(await firstTextAt(out)).toEqual([50, 500]);
  });

  it("places text where it's seen on a page turned 180° and 270°", async () => {
    for (const rotation of [180, 270]) {
      const [w, h] = rotation === 180 ? [1200, 1600] : [1600, 1200];
      const out = await addTextLayers(await scan(rotation), [{ page: 0, pdf: await layer("Turned", w, h) }]);
      expect(await firstTextAt(out)).toEqual([50, h / 2 - 100]);
    }
  });

  it("fits the layer to a cropped page's visible area", async () => {
    const doc = await PDFDocument.load(await scan());
    doc.getPage(0).setCropBox(100, 200, 300, 400);
    const out = await addTextLayers(await doc.save(), [{ page: 0, pdf: await layer("Cropped") }]);
    // 1200 × 1600 onto 300 × 400: a quarter. pdf.js measures from the crop box's corner.
    expect(await firstTextAt(out)).toEqual([25, 350]);
  });

  it("keeps what was already drawn on the page", async () => {
    const doc = await PDFDocument.load(await scan());
    doc.getPage(0).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
    const before = (await pageContents(await doc.save()))[0];
    const out = await addTextLayers(await doc.save(), [{ page: 0, pdf: await layer("Over") }]);
    expect((await pageContents(out))[0]).toContain(before.trim());
  });

  it("draws the layer as one embedded page", async () => {
    const out = await addTextLayers(await scan(), [{ page: 0, pdf: await layer("Form") }]);
    const doc = await PDFDocument.load(out);
    const xobjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"));
    expect(xobjects?.toString()).toMatch(/EmbeddedPdfPage/);
    expect(doc.getPage(1).node.Resources()?.lookup(PDFName.of("XObject"))).toBeUndefined();
  });

  it("returns the PDF unchanged in content when there are no layers", async () => {
    const out = await addTextLayers(await scan(), []);
    expect(await texts(out)).toEqual(["", "", ""]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it("refuses a file that isn't a PDF", async () => {
    await expect(addTextLayers(new TextEncoder().encode("not a pdf"), [])).rejects.toThrow();
  });
});

describe("OCR_LANGUAGES", () => {
  it("starts with English and has no repeats", () => {
    expect(OCR_LANGUAGES[0].code).toBe("eng");
    expect(new Set(OCR_LANGUAGES.map((l) => l.code)).size).toBe(OCR_LANGUAGES.length);
  });
});

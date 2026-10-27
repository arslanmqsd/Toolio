import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, degrees } from "pdf-lib";
import { organizePages, rotatePdf, turnsToDegrees } from "./pdf-organize";

/** Pages 101, 102, … points wide, so they can be told apart after reordering; `rotations` sets their own /Rotate. */
async function numberedPdf(pageCount: number, rotations: number[] = []) {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pageCount; i++) doc.addPage([100 + i, 800]).setRotation(degrees(rotations[i - 1] ?? 0));
  return doc.save();
}

async function describePages(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPages().map((p) => `${p.getWidth() - 100}@${p.getRotation().angle}`);
}

describe("turnsToDegrees", () => {
  it("wraps any number of quarter turns into 0–270", () => {
    expect([0, 1, 2, 3, 4, 5, -1, -2, -5].map(turnsToDegrees)).toEqual([0, 90, 180, 270, 0, 90, 270, 180, 270]);
  });
});

describe("organizePages", () => {
  it("reorders pages and leaves out deleted ones", async () => {
    const out = await organizePages(await numberedPdf(4), [
      { index: 3, turns: 0 },
      { index: 0, turns: 0 },
      { index: 2, turns: 0 },
    ]);
    expect(await describePages(out)).toEqual(["4@0", "1@0", "3@0"]);
  });

  it("rotates pages clockwise and anticlockwise", async () => {
    const out = await organizePages(await numberedPdf(3), [
      { index: 0, turns: 1 },
      { index: 1, turns: -1 },
      { index: 2, turns: 2 },
    ]);
    expect(await describePages(out)).toEqual(["1@90", "2@270", "3@180"]);
  });

  it("adds to a page's own rotation, wrapping at 360", async () => {
    const out = await organizePages(await numberedPdf(2, [90, 270]), [
      { index: 0, turns: 1 },
      { index: 1, turns: 1 },
    ]);
    expect(await describePages(out)).toEqual(["1@180", "2@0"]);
  });

  it("keeps everything as it was when nothing changed", async () => {
    const out = await organizePages(await numberedPdf(3, [0, 90, 0]), [0, 1, 2].map((index) => ({ index, turns: 0 })));
    expect(await describePages(out)).toEqual(["1@0", "2@90", "3@0"]);
  });

  it("can repeat a page", async () => {
    const out = await organizePages(await numberedPdf(2), [
      { index: 1, turns: 0 },
      { index: 1, turns: 1 },
    ]);
    expect(await describePages(out)).toEqual(["2@0", "2@90"]);
  });

  it("refuses to make a PDF with no pages, or from a file that isn't a PDF", async () => {
    await expect(organizePages(await numberedPdf(2), [])).rejects.toThrow("at least one page");
    await expect(organizePages(new TextEncoder().encode("nope"), [{ index: 0, turns: 0 }])).rejects.toThrow();
  });
});

describe("rotatePdf", () => {
  it("turns every page, keeping their order", async () => {
    expect(await describePages(await rotatePdf(await numberedPdf(3), 1))).toEqual(["1@90", "2@90", "3@90"]);
  });

  it("turns anticlockwise and half way", async () => {
    expect(await describePages(await rotatePdf(await numberedPdf(2), -1))).toEqual(["1@270", "2@270"]);
    expect(await describePages(await rotatePdf(await numberedPdf(2), 2))).toEqual(["1@180", "2@180"]);
  });

  it("adds to each page's own rotation, wrapping at 360", async () => {
    expect(await describePages(await rotatePdf(await numberedPdf(3, [0, 90, 270]), 1))).toEqual(["1@90", "2@180", "3@0"]);
  });

  it("leaves pages alone for a full turn", async () => {
    expect(await describePages(await rotatePdf(await numberedPdf(2, [90, 0]), 4))).toEqual(["1@90", "2@0"]);
  });

  it("keeps bookmarks and other document parts, unlike copying pages", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.catalog.set(PDFName.of("Outlines"), doc.context.register(doc.context.obj({ Type: "Outlines", Count: 0 })));
    const out = await PDFDocument.load(await rotatePdf(await doc.save(), 1));
    expect(out.catalog.has(PDFName.of("Outlines"))).toBe(true);
  });

  it("refuses files that aren't PDFs", async () => {
    await expect(rotatePdf(new TextEncoder().encode("nope"), 1)).rejects.toThrow();
  });
});

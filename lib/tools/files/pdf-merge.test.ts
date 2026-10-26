import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { countPages, mergePdfs, type MergeProgress } from "./pdf-merge";
import { pdfErrorMessage } from "./pdf-errors";

/** A PDF whose pages are `widths` points wide, so the merged order can be read back from the sizes. */
async function pdf(...widths: number[]) {
  const doc = await PDFDocument.create();
  for (const width of widths) doc.addPage([width, 800]).drawText(`Page ${width}`);
  return doc.save();
}

const widthsOf = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());

describe("countPages", () => {
  it("counts the pages of a PDF", async () => {
    expect(await countPages(await pdf(100, 200, 300))).toBe(3);
  });

  it("throws for files that aren't PDFs", async () => {
    await expect(countPages(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });
});

describe("mergePdfs", () => {
  it("puts every page of every file in the order given", async () => {
    const merged = await mergePdfs([await pdf(100, 101), await pdf(200), await pdf(300, 301, 302)]);
    expect(await widthsOf(merged)).toEqual([100, 101, 200, 300, 301, 302]);
  });

  it("follows the list order, not the order the files were made", async () => {
    const a = await pdf(100);
    const b = await pdf(200);
    expect(await widthsOf(await mergePdfs([b, a]))).toEqual([200, 100]);
  });

  it("can include the same file twice", async () => {
    const a = await pdf(100);
    expect(await widthsOf(await mergePdfs([a, a]))).toEqual([100, 100]);
  });

  it("keeps page rotation", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 200]).setRotation(degrees(90));
    const merged = await PDFDocument.load(await mergePdfs([await doc.save(), await pdf(300)]));
    expect(merged.getPage(0).getRotation().angle).toBe(90);
    expect(merged.getPage(1).getRotation().angle).toBe(0);
  });

  it("works with a single file", async () => {
    expect(await widthsOf(await mergePdfs([await pdf(100, 200)]))).toEqual([100, 200]);
  });

  it("reports each file, then saving", async () => {
    const steps: MergeProgress[] = [];
    await mergePdfs([await pdf(100), await pdf(200)], (p) => steps.push(p));
    expect(steps).toEqual([
      { phase: "adding", done: 0, total: 2 },
      { phase: "adding", done: 1, total: 2 },
      { phase: "saving" },
    ]);
  });

  it("refuses an empty list or a file that isn't a PDF", async () => {
    await expect(mergePdfs([])).rejects.toThrow();
    await expect(mergePdfs([await pdf(100), new TextEncoder().encode("nope")])).rejects.toThrow();
  });
});

describe("pdfErrorMessage", () => {
  it("explains password-protected files and anything else", () => {
    expect(pdfErrorMessage("Input document to `PDFDocument.load` is encrypted.")).toMatch(/password-protected/);
    expect(pdfErrorMessage("No password given")).toMatch(/password-protected/);
    expect(pdfErrorMessage("out of memory")).toMatch(/ran out of memory/);
    expect(pdfErrorMessage("Failed to parse PDF document")).toMatch(/couldn't be read as a PDF/);
  });
});

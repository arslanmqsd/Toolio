import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPages, parsePageRanges, rangeIndexes, rangeLabel, type SplitProgress } from "./pdf-split";

const ranges = (input: string, pageCount = 10) => {
  const parsed = parsePageRanges(input, pageCount);
  return parsed.ok ? parsed.ranges.map(rangeLabel) : parsed.error;
};

/** A PDF whose pages are 101, 102, … points wide, so copied pages can be told apart by width. */
async function numberedPdf(pageCount: number) {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pageCount; i++) doc.addPage([100 + i, 800]);
  return doc.save();
}

const pageNumbers = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth() - 100);

describe("parsePageRanges", () => {
  it("reads single pages and ranges, separated by commas or spaces", () => {
    expect(ranges("1-3, 5")).toEqual(["1-3", "5"]);
    expect(ranges("1-3 5;7")).toEqual(["1-3", "5", "7"]);
    expect(ranges(" 2 - 4 ,6 ")).toEqual(["2-4", "6"]);
  });

  it("runs open ranges to the first or last page", () => {
    expect(ranges("8-")).toEqual(["8-10"]);
    expect(ranges("-3")).toEqual(["1-3"]);
  });

  it("allows backwards ranges, repeats and en dashes", () => {
    expect(ranges("5-3, 1, 1")).toEqual(["5-3", "1", "1"]);
    expect(ranges("2–4")).toEqual(["2-4"]);
  });

  it("explains pages that don't exist", () => {
    expect(ranges("0")).toBe("There's no page 0: this PDF has 10 pages.");
    expect(ranges("9-12")).toBe("There's no page 12: this PDF has 10 pages.");
    expect(ranges("2", 1)).toBe("There's no page 2: this PDF has 1 page.");
  });

  it("explains input that isn't a page or range", () => {
    expect(ranges("")).toBe("Enter the pages to extract, like 1-3, 5.");
    expect(ranges("1-3, abc")).toBe(`"abc" isn't a page or a range like 2-5.`);
    expect(ranges("-")).toBe(`"-" isn't a page or a range like 2-5.`);
    expect(ranges("1-2-3")).toBe(`"1-2-3" isn't a page or a range like 2-5.`);
  });
});

describe("rangeIndexes", () => {
  it("lists zero-based indexes in the range's order", () => {
    expect(rangeIndexes({ from: 2, to: 4 })).toEqual([1, 2, 3]);
    expect(rangeIndexes({ from: 4, to: 2 })).toEqual([3, 2, 1]);
    expect(rangeIndexes({ from: 3, to: 3 })).toEqual([2]);
  });
});

describe("extractPages", () => {
  it("copies the chosen pages, in the order chosen", async () => {
    const [out] = await extractPages(await numberedPdf(6), [[4, 0, 2, 2]]);
    expect(await pageNumbers(out)).toEqual([5, 1, 3, 3]);
  });

  it("makes one file per group", async () => {
    const outs = await extractPages(await numberedPdf(6), [rangeIndexes({ from: 1, to: 2 }), rangeIndexes({ from: 6, to: 4 })]);
    expect(await Promise.all(outs.map(pageNumbers))).toEqual([
      [1, 2],
      [6, 5, 4],
    ]);
  });

  it("reports reading, then each file", async () => {
    const steps: SplitProgress[] = [];
    await extractPages(await numberedPdf(3), [[0], [1]], (p) => steps.push(p));
    expect(steps).toEqual([
      { phase: "reading" },
      { phase: "writing", done: 0, total: 2 },
      { phase: "writing", done: 1, total: 2 },
    ]);
  });

  it("throws for files that aren't PDFs", async () => {
    await expect(extractPages(new TextEncoder().encode("nope"), [[0]])).rejects.toThrow();
  });
});

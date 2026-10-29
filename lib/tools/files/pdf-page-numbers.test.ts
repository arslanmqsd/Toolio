import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { addPageNumbers, formatPageNumber, seenOrigin, seenToUser, type PageNumberOptions } from "./pdf-page-numbers";
import { pageContents, shownText, textMatrices } from "./pdf-test-utils";

const OPTIONS: PageNumberOptions = {
  vertical: "bottom",
  horizontal: "center",
  mirror: false,
  margin: 36,
  format: "n",
  font: "sans",
  size: 12,
  bold: false,
  color: "black",
  start: 1,
};

async function letterPdf(pageCount: number, rotations: number[] = []) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([612, 792]).setRotation(degrees(rotations[i] ?? 0));
  return doc.save();
}

const numbersOn = async (bytes: Uint8Array) => (await pageContents(bytes)).map((c) => shownText(c).join(""));
/** Where each page's number starts (x, y) and its turn in degrees. */
const placements = async (bytes: Uint8Array) =>
  (await pageContents(bytes)).map((c) => {
    const [a, b, , , e, f] = textMatrices(c)[0];
    return { x: Math.round(e), y: Math.round(f), angle: Math.round((Math.atan2(b, a) * 180) / Math.PI) };
  });

describe("formatPageNumber", () => {
  it("writes each format", () => {
    expect(formatPageNumber("n", 7, 12)).toBe("7");
    expect(formatPageNumber("page-n", 7, 12)).toBe("Page 7");
    expect(formatPageNumber("n-of-total", 7, 12)).toBe("7 / 12");
    expect(formatPageNumber("page-n-of-total", 7, 12)).toBe("Page 7 of 12");
  });
});

describe("seenOrigin", () => {
  const page = { width: 600, height: 800 };
  const text = { width: 20, capHeight: 9 };

  it("places each corner and centre inside the margin", () => {
    expect(seenOrigin(page, text, { vertical: "bottom", horizontal: "left", margin: 36 })).toEqual([36, 36]);
    expect(seenOrigin(page, text, { vertical: "bottom", horizontal: "right", margin: 36 })).toEqual([544, 36]);
    expect(seenOrigin(page, text, { vertical: "bottom", horizontal: "center", margin: 36 })).toEqual([290, 36]);
    expect(seenOrigin(page, text, { vertical: "top", horizontal: "center", margin: 36 })).toEqual([290, 755]);
  });
});

describe("seenToUser", () => {
  const box = { x: 0, y: 0, width: 600, height: 800 };

  it("passes points through on an upright page and shifts by the crop box", () => {
    expect(seenToUser(box, 0, [10, 20])).toEqual([10, 20]);
    expect(seenToUser({ ...box, x: 50, y: 30 }, 0, [10, 20])).toEqual([60, 50]);
  });

  it("maps the seen bottom-left corner to the right drawing corner for each turn", () => {
    // Bottom-left as seen is where the drawing's corner ends up after turning clockwise for display.
    expect(seenToUser(box, 90, [0, 0])).toEqual([600, 0]);
    expect(seenToUser(box, 180, [0, 0])).toEqual([600, 800]);
    expect(seenToUser(box, 270, [0, 0])).toEqual([0, 800]);
    expect(seenToUser(box, -90, [0, 0])).toEqual([0, 800]);
  });

  it("moves along the right drawing axis on turned pages", () => {
    // Moving right on a page turned 90° runs up the drawing; moving up runs left.
    expect(seenToUser(box, 90, [100, 0])).toEqual([600, 100]);
    expect(seenToUser(box, 90, [0, 100])).toEqual([500, 0]);
  });
});

describe("addPageNumbers", () => {
  it("numbers every page", async () => {
    expect(await numbersOn(await addPageNumbers(await letterPdf(3), OPTIONS))).toEqual(["1", "2", "3"]);
  });

  it("uses the format, first number and total", async () => {
    const out = await addPageNumbers(await letterPdf(3), { ...OPTIONS, format: "page-n-of-total", start: 5 });
    expect(await numbersOn(out)).toEqual(["Page 5 of 7", "Page 6 of 7", "Page 7 of 7"]);
  });

  it("numbers only the chosen pages, counting from the first of them", async () => {
    const out = await addPageNumbers(await letterPdf(4), { ...OPTIONS, format: "n-of-total" }, [1, 2, 3]);
    expect(await numbersOn(out)).toEqual(["", "1 / 3", "2 / 3", "3 / 3"]);
  });

  it("puts numbers at the chosen spot", async () => {
    const [bottomLeft] = await placements(await addPageNumbers(await letterPdf(1), { ...OPTIONS, horizontal: "left" }));
    expect(bottomLeft).toEqual({ x: 36, y: 36, angle: 0 });
    const [top] = await placements(await addPageNumbers(await letterPdf(1), { ...OPTIONS, vertical: "top", margin: 18 }));
    expect(top.y).toBeGreaterThan(792 - 18 - 12);
    expect(top.y).toBeLessThan(792 - 18);
  });

  it("swaps sides on even pages when mirrored", async () => {
    const out = await addPageNumbers(await letterPdf(2), { ...OPTIONS, horizontal: "right", mirror: true });
    const [odd, even] = await placements(out);
    expect(odd.x).toBeGreaterThan(500);
    expect(even.x).toBe(36);
  });

  it("keeps numbers upright and at the seen bottom on turned pages", async () => {
    const out = await addPageNumbers(await letterPdf(2, [0, 90]), { ...OPTIONS, horizontal: "left" });
    const [, turned] = await placements(out);
    // Turned 90°: the seen bottom edge is the drawing's right edge, and text runs up it.
    expect(turned).toEqual({ x: 612 - 36, y: 36, angle: 90 });
  });

  it("refuses files that aren't PDFs", async () => {
    await expect(addPageNumbers(new TextEncoder().encode("nope"), OPTIONS)).rejects.toThrow();
  });
});

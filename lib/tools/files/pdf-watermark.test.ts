import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, PDFRef, decodePDFRawStream, degrees } from "pdf-lib";
import { fontSizeFor, stampCentres, unsupportedCharacters, watermarkPdf, type WatermarkOptions } from "./pdf-watermark";

const OPTIONS: WatermarkOptions = { text: "DRAFT", layout: "center", size: "medium", opacity: 0.3, angle: 45, color: "gray" };

async function letterPdf(pageCount: number, rotations: number[] = []) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([612, 792]).setRotation(degrees(rotations[i] ?? 0));
  return doc.save();
}

/** Every page's drawing commands, decoded. */
async function pageContents(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return refs
      .map((ref) => doc.context.lookup(ref as PDFRef))
      .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
      .map((s) => new TextDecoder().decode(decodePDFRawStream(s).decode()))
      .join("\n");
  });
}

const stampCount = (content: string) => content.match(/\bTj\b/g)?.length ?? 0;
/** The rotation the text was drawn at, from its text matrix ("a b c d e f Tm"). */
function drawnAngle(content: string): number {
  const m = /(-?[\d.e-]+) (-?[\d.e-]+) -?[\d.e-]+ -?[\d.e-]+ -?[\d.e-]+ -?[\d.e-]+ Tm/.exec(content);
  return m ? Math.round((Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI) : NaN;
}

describe("unsupportedCharacters", () => {
  it("allows Western European text and Windows-1252 punctuation", () => {
    expect(unsupportedCharacters("CONFIDENTIAL — Café Ünïcode “quoted” €5 © ®")).toEqual([]);
  });

  it("lists other scripts and emoji once each", () => {
    expect(unsupportedCharacters("草稿 草 ✓ 😀")).toEqual(["草", "稿", "✓", "😀"]);
    expect(unsupportedCharacters("line\nbreak")).toEqual(["\n"]);
  });
});

describe("stampCentres", () => {
  const box = { x: 0, y: 0, width: 600, height: 800 };

  it("puts a centred stamp in the middle of the visible box", () => {
    expect(stampCentres(box, "center", 100, 20)).toEqual([[300, 400]]);
    expect(stampCentres({ x: 50, y: 100, width: 200, height: 100 }, "center", 10, 10)).toEqual([[150, 150]]);
  });

  it("tiles past every corner", () => {
    const centres = stampCentres(box, "tiled", 120, 20);
    expect(centres.length).toBeGreaterThan(20);
    const xs = centres.map(([x]) => x);
    const ys = centres.map(([, y]) => y);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(600);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(800);
  });
});

describe("fontSizeFor", () => {
  const box = { x: 0, y: 0, width: 300, height: 400 };

  it("spans a share of the diagonal when centred", () => {
    // Diagonal 500; medium spans 55%, so 275 points of text at 1 point per unit of width.
    expect(fontSizeFor(box, { layout: "center", size: "medium" }, 10, 0.7)).toBeCloseTo(27.5);
  });

  it("grows with size", () => {
    const at = (size: "small" | "medium" | "large") => fontSizeFor(box, { layout: "tiled", size }, 10, 0.7);
    expect(at("small")).toBeLessThan(at("medium"));
    expect(at("medium")).toBeLessThan(at("large"));
  });

  it("keeps short text from getting taller than 40% of the short side", () => {
    // One narrow letter would otherwise be hundreds of points tall.
    expect(fontSizeFor(box, { layout: "center", size: "large" }, 0.7, 0.7)).toBeCloseTo(120 / 0.7);
  });
});

describe("watermarkPdf", () => {
  it("stamps every page once when centred", async () => {
    const contents = await pageContents(await watermarkPdf(await letterPdf(3), OPTIONS));
    expect(contents.map(stampCount)).toEqual([1, 1, 1]);
  });

  it("repeats the stamp when tiled", async () => {
    const [content] = await pageContents(await watermarkPdf(await letterPdf(1), { ...OPTIONS, layout: "tiled" }));
    expect(stampCount(content)).toBeGreaterThan(10);
  });

  it("only stamps the chosen pages", async () => {
    const contents = await pageContents(await watermarkPdf(await letterPdf(4), OPTIONS, [1, 3]));
    expect(contents.map(stampCount)).toEqual([0, 1, 0, 1]);
  });

  it("draws at the chosen angle, adding the page's own turn", async () => {
    const [flat, turned] = await pageContents(await watermarkPdf(await letterPdf(2, [0, 90]), OPTIONS));
    expect(drawnAngle(flat)).toBe(45);
    expect(drawnAngle(turned)).toBe(135);
  });

  it("sets the opacity", async () => {
    const out = await watermarkPdf(await letterPdf(1), { ...OPTIONS, opacity: 0.15 });
    const page = (await PDFDocument.load(out)).getPage(0);
    expect(String(page.node.Resources())).toMatch(/\/ca 0\.15/);
  });

  it("trims the text and refuses empty or undrawable text", async () => {
    const pdf = await letterPdf(1);
    await expect(watermarkPdf(pdf, { ...OPTIONS, text: "   " })).rejects.toThrow("Enter the watermark text");
    await expect(watermarkPdf(pdf, { ...OPTIONS, text: "草稿" })).rejects.toThrow("can't draw 草 稿");
  });

  it("refuses files that aren't PDFs", async () => {
    await expect(watermarkPdf(new TextEncoder().encode("nope"), OPTIONS)).rejects.toThrow();
  });
});

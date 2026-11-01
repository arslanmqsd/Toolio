import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from "pdf-lib";
import { pageContents, shownText } from "./pdf-test-utils";
import { chosenPages, findMatches, redactPages, type FlatPage } from "./pdf-redact";

const letters = (text: string) => [...text];

describe("findMatches", () => {
  it("finds each match as first and last letter", () => {
    expect(findMatches(letters("call 555 or 555"), "555")).toEqual([
      [5, 7],
      [12, 14],
    ]);
  });

  it("ignores case", () => {
    expect(findMatches(letters("Jane DOE"), "doe")).toEqual([[5, 7]]);
  });

  it("matches across a missing space between pieces", () => {
    expect(findMatches(letters("JohnSmith"), "John Smith")).toEqual([[0, 8]]);
  });

  it("matches across extra spaces in the page text", () => {
    expect(findMatches(letters("John  Smith"), "john smith")).toEqual([[0, 10]]);
  });

  it("finds nothing for an empty or blank query", () => {
    expect(findMatches(letters("anything"), "")).toEqual([]);
    expect(findMatches(letters("anything"), "   ")).toEqual([]);
  });

  it("finds nothing when the text isn't there", () => {
    expect(findMatches(letters("hello"), "world")).toEqual([]);
  });

  it("doesn't overlap matches", () => {
    expect(findMatches(letters("aaaa"), "aa")).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("keeps indexes right after a letter that lower-cases to two", () => {
    expect(findMatches(letters("İx secret"), "secret")).toEqual([[3, 8]]);
  });
});

// A 1×1 black PNG.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0)).buffer;

/** Two pages: a secret on the first, and on the second a link that jumps to the first. */
async function sample() {
  const doc = await PDFDocument.create();
  doc.setTitle("Payroll");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage([300, 400]);
  first.drawText("SECRET-123", { x: 20, y: 300, font, size: 12 });
  const second = doc.addPage([300, 400]);
  second.drawText("Public", { x: 20, y: 300, font, size: 12 });
  const link = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 50, 50], Dest: [first.ref, "Fit"] }));
  second.node.set(PDFName.of("Annots"), doc.context.obj([link]));
  return doc.save();
}

/** Everything the file stores, streams decoded, so a test can search it for leftovers. */
async function everything(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .map(([, obj]) => (obj instanceof PDFRawStream ? new TextDecoder("latin1").decode(decodePDFRawStream(obj).decode()) : obj.toString()))
    .join("\n");
}

const hex = (text: string) => [...text].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()).join("");

describe("redactPages", () => {
  const flatFirst: FlatPage = { index: 0, png: PNG, width: 300, height: 400 };

  it("keeps the page count and order", async () => {
    const out = await PDFDocument.load(await redactPages(await sample(), [flatFirst]));
    expect(out.getPageCount()).toBe(2);
  });

  it("replaces a redacted page with just its picture", async () => {
    const [first] = await pageContents(await redactPages(await sample(), [flatFirst]));
    expect(first).toContain("Do");
    expect(shownText(first)).toEqual([]);
  });

  it("leaves no trace of the redacted text anywhere in the file", async () => {
    const all = await everything(await redactPages(await sample(), [flatFirst]));
    expect(all).not.toContain(hex("SECRET-123"));
    expect(all).not.toContain("SECRET-123");
  });

  it("keeps pages without redactions as they were", async () => {
    const [, second] = await pageContents(await redactPages(await sample(), [flatFirst]));
    expect(shownText(second)).toEqual(["Public"]);
  });

  it("drops a link that points at a redacted page", async () => {
    const out = await PDFDocument.load(await redactPages(await sample(), [flatFirst]));
    expect(out.getPage(1).node.Annots()?.size() ?? 0).toBe(0);
  });

  it("keeps links when the page they point at isn't redacted", async () => {
    const out = await PDFDocument.load(await redactPages(await sample(), [{ ...flatFirst, index: 1 }]));
    expect(out.getPageCount()).toBe(2);
    expect(shownText((await pageContents(await out.save()))[0])).toEqual(["SECRET-123"]);
  });

  it("sizes the new page as the page was seen", async () => {
    const out = await PDFDocument.load(await redactPages(await sample(), [{ ...flatFirst, width: 400, height: 300 }]));
    expect(out.getPage(0).getSize()).toEqual({ width: 400, height: 300 });
  });

  it("leaves the document's info behind", async () => {
    const out = await PDFDocument.load(await redactPages(await sample(), [flatFirst]), { updateMetadata: false });
    expect(out.getTitle()).toBeUndefined();
  });

  it("reports progress through to saving", async () => {
    const phases: string[] = [];
    await redactPages(await sample(), [flatFirst], (p) => phases.push(p.phase));
    expect(phases[0]).toBe("reading");
    expect(phases).toContain("editing");
    expect(phases.at(-1)).toBe("saving");
  });
});

describe("chosenPages", () => {
  it("covers just the current page", () => {
    expect(chosenPages("current", 2, "", 5)).toEqual({ ok: true, pages: [2] });
  });

  it("counts odd pages from page 1", () => {
    expect(chosenPages("odd", 0, "", 5)).toEqual({ ok: true, pages: [0, 2, 4] });
  });

  it("counts even pages from page 2", () => {
    expect(chosenPages("even", 0, "", 5)).toEqual({ ok: true, pages: [1, 3] });
  });

  it("says so when a one-page PDF has no even pages", () => {
    expect(chosenPages("even", 0, "", 1)).toEqual({ ok: false, error: "This PDF has no even pages." });
  });

  it("reads typed pages and ranges, sorted with no repeats", () => {
    expect(chosenPages("specify", 0, "5, 1-3, 2", 6)).toEqual({ ok: true, pages: [0, 1, 2, 4] });
  });

  it("runs an open range to the last page", () => {
    expect(chosenPages("specify", 0, "4-", 6)).toEqual({ ok: true, pages: [3, 4, 5] });
  });

  it("asks for pages when none are typed", () => {
    expect(chosenPages("specify", 0, "  ", 6)).toEqual({ ok: false, error: "Enter the pages to black out, like 1-3, 5." });
  });

  it("rejects a page past the end", () => {
    expect(chosenPages("specify", 0, "9", 6)).toMatchObject({ ok: false, error: expect.stringContaining("no page 9") });
  });
});

import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, degrees } from "pdf-lib";
import { SWATCH_ROWS, hexRgb } from "./pdf-colors";
import { applyEdits, seenSize, type EditItem, type EditProgress } from "./pdf-editor";
import { pageContents, shownText, textMatrices } from "./pdf-test-utils";

async function pdf(pages: { size?: [number, number]; rotation?: number; crop?: [number, number, number, number] }[]) {
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const page = doc.addPage(p.size ?? [600, 800]);
    page.setRotation(degrees(p.rotation ?? 0));
    if (p.crop) page.setCropBox(...p.crop);
  }
  return doc.save();
}

const rect = (extra: Partial<EditItem> = {}) =>
  ({ kind: "rect", page: 0, x: 10, y: 20, width: 100, height: 50, color: "#ff0000", fill: null, stroke: 2, ...extra }) as EditItem;
const TEXT_STYLE = { font: "sans", size: 12, color: "#000000", bold: false, italic: false, underline: false, background: null, align: "left", opacity: 1 };
const text = (extra: Partial<EditItem> = {}) => ({ kind: "text", page: 0, x: 10, y: 20, text: "Hi", ...TEXT_STYLE, ...extra }) as EditItem;

async function annots(bytes: Uint8Array, page = 0) {
  const doc = await PDFDocument.load(bytes);
  const list = doc.getPage(page).node.Annots();
  return (list?.asArray() ?? []).map((ref) => doc.context.lookup(ref) as PDFDict);
}

describe("seenSize", () => {
  it("swaps width and height on sideways pages and uses the crop box", async () => {
    const doc = await PDFDocument.load(await pdf([{}, { rotation: 90 }, { crop: [0, 0, 300, 400] }]));
    expect(doc.getPages().map(seenSize)).toEqual([
      { width: 600, height: 800 },
      { width: 800, height: 600 },
      { width: 300, height: 400 },
    ]);
  });
});

describe("hexRgb", () => {
  it("reads #rrggbb as 0–1 channels", () => {
    expect(hexRgb("#ff0000")).toEqual([1, 0, 0]);
    expect(hexRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexRgb("#336699")).toEqual([0.2, 0.4, 0.6]);
  });

  it("can read every swatch", () => {
    for (const { color } of SWATCH_ROWS.flat()) expect(hexRgb(color).every((c) => c >= 0 && c <= 1)).toBe(true);
  });
});

describe("applyEdits", () => {
  it("draws a rectangle outline measured from the top-left of the page", async () => {
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [rect()]));
    // Top-left (10, 20) on an 800pt-tall page puts the bottom edge at 800 - 20 - 50.
    expect(content).toContain("1 0 0 1 10 730 cm");
    expect(content).toContain("100 50 l");
    expect(content).toContain("1 0 0 RG\n2 w");
    expect(content).toMatch(/h\nS/);
  });

  it("fills highlights with a multiply blend so text underneath stays readable", async () => {
    const bytes = await applyEdits(await pdf([{}]), [{ kind: "highlight", page: 0, x: 10, y: 20, width: 100, height: 50, color: "#ffff00" }]);
    const [content] = await pageContents(bytes);
    expect(content).toContain("1 1 0 rg");
    expect(content).toMatch(/h\nf/);
    const doc = await PDFDocument.load(bytes);
    const states = doc.getPage(0).node.Resources()!.lookup(PDFName.of("ExtGState"), PDFDict);
    const modes = states.values().map((ref) => (doc.context.lookup(ref) as PDFDict).get(PDFName.of("BM"))?.toString());
    expect(modes).toContain("/Multiply");
  });

  it("fills shapes when a fill colour is set, and leaves them see-through otherwise", async () => {
    const [filled] = await pageContents(await applyEdits(await pdf([{}]), [rect({ fill: "#ffff00" })]));
    expect(filled).toContain("1 1 0 rg");
    expect(filled).toMatch(/h\nB/);
    const [ellipse] = await pageContents(await applyEdits(await pdf([{}]), [rect({ kind: "ellipse", fill: "#0000ff" })]));
    expect(ellipse).toContain("0 0 1 rg");
    const [empty] = await pageContents(await applyEdits(await pdf([{}]), [rect()]));
    expect(empty).not.toMatch(/ rg/);
  });

  it("draws freehand strokes through their points, with round joins", async () => {
    const ink: EditItem = { kind: "ink", page: 0, x: 100, y: 100, points: [[0, 0], [10, 5], [20, 0]], color: "#0000ff", stroke: 4 };
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [ink]));
    // Offsets from (100, 100) measured down from the top of an 800pt page.
    expect(content).toContain("100 700 m\n110 695 l\n120 700 l\nS");
    expect(content).toContain("0 0 1 RG");
    expect(content).toContain("4 w");
    expect(content).toContain("1 J");
    expect(content).toContain("1 j");
  });

  it("draws a single-point stroke as a dot and skips empty ones", async () => {
    const dot: EditItem = { kind: "ink", page: 0, x: 50, y: 50, points: [[0, 0]], color: "#000000", stroke: 6 };
    const empty: EditItem = { ...dot, points: [] };
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [dot, empty]));
    expect(content.match(/ m\n/g)).toHaveLength(1);
    expect(content).toContain("50 750 m\n50 750 l");
  });

  it("follows the page's turn for freehand strokes", async () => {
    const ink: EditItem = { kind: "ink", page: 0, x: 10, y: 20, points: [[0, 0], [100, 50]], color: "#000000", stroke: 2 };
    const [content] = await pageContents(await applyEdits(await pdf([{ rotation: 90 }]), [ink]));
    // Seen 800 wide × 600 tall; same corners as the sideways rectangle test.
    expect(content).toContain("20 10 m\n70 110 l");
  });

  describe("images", () => {
    // A 1×1 PNG and the smallest valid JPEG header pdf-lib accepts are enough to embed.
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0)).buffer;
    const image = (extra: Partial<EditItem> = {}) => ({ kind: "image", page: 0, x: 10, y: 20, width: 100, height: 50, rotation: 0, bytes: png, type: "png", ...extra }) as EditItem;
    const xObjects = async (bytes: Uint8Array) => {
      const doc = await PDFDocument.load(bytes);
      // Each placement gets its own name on the page, but they should point at one stored picture.
      return new Set(doc.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).values().map(String)).size;
    };

    it("places a picture at its box, measured from the top-left", async () => {
      const [content] = await pageContents(await applyEdits(await pdf([{}]), [image()]));
      // Scaled to 100×50 with its bottom-left at (10, 800 - 20 - 50).
      expect(content).toMatch(/1 0 0 1 10 730 cm\n(?:1 0 0 1 0 0 cm\n)?100 0 0 50 0 0 cm/);
      expect(content).toMatch(/\/Image-\d+ Do/);
    });

    it("stores a picture placed twice only once", async () => {
      expect(await xObjects(await applyEdits(await pdf([{}]), [image(), image({ x: 200 })]))).toBe(1);
    });

    /** Where the picture starts, its turn anticlockwise (0–359°), and its drawn size. */
    const placement = (content: string) => {
      const [, x, y, a, b, w, h] = content.match(/1 0 0 1 (\S+) (\S+) cm\n(\S+) (\S+) \S+ \S+ 0 0 cm\n(\S+) 0 0 (\S+) 0 0 cm/)!.map(Number);
      return { x: Math.round(x), y: Math.round(y), turn: (Math.round((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360, w, h };
    };

    it("turns a picture inside its box, starting from the corner that keeps it in place", async () => {
      // Box 100 wide × 50 tall at (10, 20) on an 800pt page: bottom 730, top 780.
      const at = async (rotation: number) =>
        placement((await pageContents(await applyEdits(await pdf([{}]), [image({ rotation } as Partial<EditItem>)])))[0]);
      expect(await at(90)).toEqual({ x: 10, y: 780, turn: 270, w: 50, h: 100 });
      expect(await at(180)).toEqual({ x: 110, y: 780, turn: 180, w: 100, h: 50 });
      expect(await at(270)).toEqual({ x: 110, y: 730, turn: 90, w: 50, h: 100 });
    });

    it("turns pictures with sideways pages so they show upright", async () => {
      const [content] = await pageContents(await applyEdits(await pdf([{ rotation: 90 }]), [image()]));
      // Bottom-left as seen (10, 70 down) maps to (600 - 530, 10); the picture is turned a quarter.
      const turn = content.match(/1 0 0 1 70 10 cm\n(\S+) (\S+) (\S+) (\S+) 0 0 cm/)!.slice(1).map(Number);
      expect(turn.map((n) => Math.round(n))).toEqual([0, 1, -1, 0]);
    });
  });

  it("draws lines between their two points", async () => {
    const line: EditItem = { kind: "line", page: 0, x: 10, y: 20, x2: 110, y2: 70, color: "#0000ff", stroke: 3 };
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [line]));
    expect(content).toContain("10 780 m");
    expect(content).toContain("110 730 l");
    expect(content).toContain("3 w");
  });

  it("draws ellipses inside their box", async () => {
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [rect({ kind: "ellipse" })]));
    // The path starts at the left edge, halfway down the box, and reaches the far right edge.
    expect(content).toContain("10 755 m");
    expect(content).toMatch(/110 755 c/);
  });

  it("writes text with its top at the box, one line per line break", async () => {
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [text({ text: "Hi\nthere", font: "serif" })]));
    expect(shownText(content)).toEqual(["Hi", "there"]);
    expect(content).toContain("/Times-Roman");
    const [[a, b, , , x, y], second] = textMatrices(content);
    expect([a, b, x]).toEqual([1, 0, 10]);
    // Line spacing is 1.2 × the size.
    expect(y - second[5]).toBeCloseTo(14.4);
    // The baseline sits one ascent below the top of the box: 0.683 × the size for Times.
    expect(y).toBeCloseTo(780 - 12 * 0.683);
  });

  it("picks the bold, italic and bold italic faces", async () => {
    const [content] = await pageContents(
      await applyEdits(await pdf([{}]), [text({ bold: true }), text({ italic: true }), text({ bold: true, italic: true, font: "serif" }), text({ font: "mono", italic: true })]),
    );
    for (const face of ["Helvetica-Bold-", "Helvetica-Oblique-", "Times-BoldItalic-", "Courier-Oblique-"]) expect(content).toContain(`/${face}`);
  });

  it("lines up each line left, centre or right inside the widest one", async () => {
    // "Hi" is narrower than "Hello there", so it shifts by the gap, or half of it when centred.
    const xs = async (align: string) =>
      textMatrices((await pageContents(await applyEdits(await pdf([{}]), [text({ text: "Hello there\nHi", align } as Partial<EditItem>)])))[0]).map((m) => m[4]);
    const [wide, leftHi] = await xs("left");
    const [, centreHi] = await xs("center");
    const [rightWide, rightHi] = await xs("right");
    expect([wide, leftHi, rightWide]).toEqual([10, 10, 10]);
    expect(rightHi).toBeGreaterThan(10);
    expect(centreHi - 10).toBeCloseTo((rightHi - 10) / 2);
  });

  it("underlines each line across its width, just under the baseline", async () => {
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [text({ underline: true, size: 20 })]));
    const [[, , , , , baseline]] = textMatrices(content);
    const [, x1, y1, x2] = content.match(/([\d.]+) ([\d.]+) m\n(?:1 J\n)?(?:[\d.]+ [\d.]+ m\n)?([\d.]+) [\d.]+ l/)!.map(Number);
    expect(x1).toBe(10);
    expect(x2).toBeGreaterThan(20);
    expect(y1).toBeCloseTo(baseline - 20 * 0.12);
    expect(content).toContain(`${+(20 * 0.06).toFixed(10)} w`);
  });

  it("fills a background behind the text box, and leaves none by default", async () => {
    const [plain] = await pageContents(await applyEdits(await pdf([{}]), [text()]));
    expect(plain).not.toMatch(/ rg\n[\s\S]* re|h\nf/);
    const [filled] = await pageContents(await applyEdits(await pdf([{}]), [text({ background: "#ffff00", text: "a\nb" })]));
    expect(filled).toContain("1 1 0 rg");
    expect(filled).toMatch(/h\nf/);
    // Two lines tall at 1.2 × 12, drawn before the text so it sits behind.
    expect(filled).toMatch(/0 28\.(8|79+)\d* l/);
    expect(filled.indexOf("h\nf")).toBeLessThan(filled.indexOf("BT"));
  });

  it("applies opacity to the text", async () => {
    const bytes = await applyEdits(await pdf([{}]), [text({ opacity: 0.5 })]);
    const doc = await PDFDocument.load(bytes);
    const states = doc.getPage(0).node.Resources()!.lookup(PDFName.of("ExtGState"), PDFDict);
    const alphas = states.values().map((ref) => (doc.context.lookup(ref) as PDFDict).get(PDFName.of("ca"))?.toString());
    expect(alphas).toContain("0.5");
  });

  it("embeds each font once however many texts use it", async () => {
    const bytes = await applyEdits(await pdf([{}, {}]), [text(), text({ page: 1 }), text({ y: 100 })]);
    const doc = await PDFDocument.load(bytes);
    const fonts = new Set(doc.getPages().flatMap((p) => p.node.Resources()!.lookup(PDFName.of("Font"), PDFDict).values().map(String)));
    expect(fonts.size).toBe(1);
  });

  it("places boxes as seen on sideways pages", async () => {
    // A 600×800 page turned a quarter is seen 800 wide and 600 tall.
    const [content] = await pageContents(await applyEdits(await pdf([{ rotation: 90 }]), [rect()]));
    expect(content).toContain("1 0 0 1 20 10 cm");
    expect(content).toContain("50 100 l");
  });

  it("turns text with the page so it reads upright", async () => {
    const [content] = await pageContents(await applyEdits(await pdf([{ rotation: 90 }]), [text()]));
    const [[a, b]] = textMatrices(content);
    expect(Math.round((Math.atan2(b, a) * 180) / Math.PI)).toBe(90);
  });

  it("measures from the crop box, not the full sheet", async () => {
    const [content] = await pageContents(await applyEdits(await pdf([{ crop: [50, 30, 300, 400] }]), [rect()]));
    // Crop box top is 30 + 400; the rectangle's bottom is 20 + 50 below that, 50 in from the left.
    expect(content).toContain("1 0 0 1 60 360 cm");
  });

  it("adds comments as sticky-note annotations, keeping any text", async () => {
    const note: EditItem = { kind: "comment", page: 0, x: 100, y: 100, text: "Check this — ✓ 数字" };
    const [annot] = await annots(await applyEdits(await pdf([{}]), [note]));
    expect(annot.get(PDFName.of("Subtype"))).toBe(PDFName.of("Text"));
    expect(annot.lookup(PDFName.of("Contents"), PDFHexString).decodeText()).toBe("Check this — ✓ 数字");
    const r = annot.lookup(PDFName.of("Rect"), PDFArray).asArray().map((n) => (n as PDFNumber).asNumber());
    expect(r).toEqual([100, 680, 120, 700]);
  });

  it("only touches the pages that have edits", async () => {
    const bytes = await applyEdits(await pdf([{}, {}, {}]), [rect({ page: 1 }), { kind: "comment", page: 2, x: 0, y: 0, text: "x" }]);
    const contents = await pageContents(bytes);
    expect(contents[0]).not.toContain(" re");
    expect(contents[0]).not.toContain("cm");
    expect(contents[1]).toContain("cm");
    expect(await annots(bytes, 0)).toHaveLength(0);
    expect(await annots(bytes, 2)).toHaveLength(1);
  });

  it("reports progress for each item, then saving", async () => {
    const seen: EditProgress[] = [];
    await applyEdits(await pdf([{}]), [rect(), text()], (p) => seen.push(p));
    expect(seen).toEqual([
      { phase: "reading" },
      { phase: "editing", done: 0, total: 2 },
      { phase: "editing", done: 1, total: 2 },
      { phase: "saving" },
    ]);
  });

  it("returns a working copy when there is nothing to add", async () => {
    const bytes = await applyEdits(await pdf([{}, {}]), []);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});

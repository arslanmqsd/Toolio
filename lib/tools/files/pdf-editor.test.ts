import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream, degrees } from "pdf-lib";
import { SWATCH_ROWS, hexRgb } from "./pdf-colors";
import { applyEdits, cloudPath, eraseInk, eraseMarkup, eraseShape, linePaths, pathD, polyPath, seenSize, type EditItem, type EditProgress } from "./pdf-editor";
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

const numbers = (array: PDFArray) => array.asArray().map((n) => Math.round((n as PDFNumber).asNumber() * 1000) / 1000);

/** Each annotation's drawn look: its drawing commands and blend mode, if any. */
async function looks(bytes: Uint8Array, page = 0) {
  const doc = await PDFDocument.load(bytes);
  const list = doc.getPage(page).node.Annots()?.asArray() ?? [];
  return list.map((ref) => {
    const annot = doc.context.lookup(ref) as PDFDict;
    const stream = doc.context.lookup(annot.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N"))) as PDFRawStream;
    const states = stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict)?.lookupMaybe(PDFName.of("ExtGState"), PDFDict);
    const blend = states?.values().map((state) => (doc.context.lookup(state) as PDFDict).get(PDFName.of("BM"))?.toString())[0];
    return { content: new TextDecoder().decode(decodePDFRawStream(stream).decode()), blend };
  });
}

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

  describe("text marks", () => {
    const mark = (style: string, extra: Partial<EditItem> = {}) =>
      ({ kind: "markup", style, page: 0, rects: [{ x: 10, y: 20, width: 100, height: 12 }], color: "#ffff00", ...extra }) as EditItem;

    it("saves each style as its own kind of annotation, with the colour", async () => {
      for (const [style, subtype] of [["highlight", "Highlight"], ["underline", "Underline"], ["strike", "StrikeOut"], ["squiggly", "Squiggly"]]) {
        const [annot] = await annots(await applyEdits(await pdf([{}]), [mark(style)]));
        expect(annot.get(PDFName.of("Subtype"))).toBe(PDFName.of(subtype));
        expect(numbers(annot.lookup(PDFName.of("C"), PDFArray))).toEqual([1, 1, 0]);
      }
    });

    it("lists each line's corners in Acrobat's order: top-left, top-right, bottom-left, bottom-right", async () => {
      const rects = [
        { x: 10, y: 20, width: 100, height: 12 },
        { x: 10, y: 34, width: 60, height: 12 },
      ];
      const [annot] = await annots(await applyEdits(await pdf([{}]), [mark("highlight", { rects } as Partial<EditItem>)]));
      expect(numbers(annot.lookup(PDFName.of("QuadPoints"), PDFArray))).toEqual([10, 780, 110, 780, 10, 768, 110, 768, 10, 766, 70, 766, 10, 754, 70, 754]);
      // The annotation's box covers every line, with a little room.
      expect(numbers(annot.lookup(PDFName.of("Rect"), PDFArray))).toEqual([8, 752, 112, 782]);
    });

    it("draws its own look, so readers show it without regenerating it", async () => {
      const [highlight] = await looks(await applyEdits(await pdf([{}]), [mark("highlight")]));
      expect(highlight.content).toContain("/Tint gs");
      expect(highlight.content).toContain("1 1 0 rg");
      expect(highlight.content).toContain("10 780 m\n110 780 l\n110 768 l\n10 768 l\nh\nf");
      expect(highlight.blend).toBe("/Multiply");
      const [underline] = await looks(await applyEdits(await pdf([{}]), [mark("underline", { color: "#ff0000" })]));
      expect(underline.content).toContain("1 0 0 RG");
      // Near the bottom of the line box: 768 + 12 × 0.06.
      expect(underline.content).toMatch(/10 768\.7\d* m\n110 768\.7\d* l\nS/);
      expect(underline.blend).toBeUndefined();
      const [strike] = await looks(await applyEdits(await pdf([{}]), [mark("strike")]));
      expect(strike.content).toMatch(/10 773\.4\d* m\n110 773\.4\d* l\nS/);
      const [squiggly] = await looks(await applyEdits(await pdf([{}]), [mark("squiggly")]));
      // A zigzag: many short segments across the 100pt line.
      expect(squiggly.content.match(/ l\n/g)!.length).toBeGreaterThan(40);
    });

    it("follows the page's turn", async () => {
      const [annot] = await annots(await applyEdits(await pdf([{ rotation: 90 }]), [mark("highlight")]));
      // Seen top-left (10, 20) on a page seen 800 × 600 maps to (600 - 580, 10).
      expect(numbers(annot.lookup(PDFName.of("QuadPoints"), PDFArray)).slice(0, 2)).toEqual([20, 10]);
    });

    it("skips marks with no boxes", async () => {
      expect(await annots(await applyEdits(await pdf([{}]), [mark("underline", { rects: [] } as Partial<EditItem>)]))).toHaveLength(0);
    });
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

  describe("freehand strokes", () => {
    const ink = (extra: Partial<EditItem> = {}) =>
      ({ kind: "ink", page: 0, x: 100, y: 100, points: [[0, 0], [10, 5], [20, 0]], color: "#0000ff", stroke: 4, marker: false, ...extra }) as EditItem;

    it("saves an ink annotation through its points, with round joins", async () => {
      const bytes = await applyEdits(await pdf([{}]), [ink()]);
      const [annot] = await annots(bytes);
      expect(annot.get(PDFName.of("Subtype"))).toBe(PDFName.of("Ink"));
      // Offsets from (100, 100) measured down from the top of an 800pt page.
      expect(numbers(annot.lookup(PDFName.of("InkList"), PDFArray).lookup(0, PDFArray))).toEqual([100, 700, 110, 695, 120, 700]);
      const [look] = await looks(bytes);
      expect(look.content).toContain("100 700 m\n110 695 l\n120 700 l\nS");
      expect(look.content).toContain("0 0 1 RG");
      expect(look.content).toContain("4 w");
      expect(look.content).toContain("1 J");
      expect(look.content).toContain("1 j");
      expect(look.blend).toBeUndefined();
    });

    it("tints like a marker when drawn with the highlighter pen", async () => {
      const [look] = await looks(await applyEdits(await pdf([{}]), [ink({ marker: true } as Partial<EditItem>)]));
      expect(look.blend).toBe("/Multiply");
    });

    it("draws a single-point stroke as a dot and skips empty ones", async () => {
      const dot = ink({ x: 50, y: 50, points: [[0, 0]], stroke: 6 } as Partial<EditItem>);
      const bytes = await applyEdits(await pdf([{}]), [dot, ink({ points: [] } as Partial<EditItem>)]);
      const all = await looks(bytes);
      expect(all).toHaveLength(1);
      expect(all[0].content).toContain("50 750 m\n50 750 l");
    });

    it("follows the page's turn", async () => {
      const bytes = await applyEdits(await pdf([{ rotation: 90 }]), [ink({ x: 10, y: 20, points: [[0, 0], [100, 50]] } as Partial<EditItem>)]);
      // Seen 800 wide × 600 tall; same corners as the sideways rectangle test.
      expect((await looks(bytes))[0].content).toContain("20 10 m\n70 110 l");
    });
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

describe("eraseInk", () => {
  // A straight 100pt stroke along y = 50, drawn with just its two ends.
  type Ink = Parameters<typeof eraseInk>[0];
  const line = (extra: Partial<Ink> = {}): Ink => ({ kind: "ink", page: 0, x: 0, y: 50, points: [[0, 0], [100, 0]], color: "#000000", stroke: 2, marker: false, ...extra });
  const ends = (pieces: ReturnType<typeof eraseInk>) => pieces.map((p) => [p.x, p.x + p.points[p.points.length - 1][0]].map(Math.round));

  it("leaves a stroke the eraser missed untouched", () => {
    const same = line();
    expect(eraseInk(same, 50, 90, 5)[0]).toBe(same);
  });

  it("cuts through the middle of a long segment, leaving two pieces", () => {
    const pieces = eraseInk(line(), 50, 50, 5);
    expect(pieces).toHaveLength(2);
    // Gone within 5 + half the 2pt line of x = 50, to the nearest filled-in point (every 2.5pt here).
    const [[a0, a1], [b0, b1]] = ends(pieces);
    expect([a0, b1]).toEqual([0, 100]);
    expect(a1).toBeGreaterThanOrEqual(41);
    expect(a1).toBeLessThan(44);
    expect(b0).toBeGreaterThan(56);
    expect(b0).toBeLessThanOrEqual(59);
  });

  it("trims an end without splitting", () => {
    const pieces = eraseInk(line(), 0, 50, 10);
    expect(pieces).toHaveLength(1);
    expect(ends(pieces)[0][1]).toBe(100);
    expect(ends(pieces)[0][0]).toBeGreaterThan(10);
  });

  it("removes a stroke entirely when the eraser covers it", () => {
    expect(eraseInk(line({ points: [[0, 0], [4, 0]] }), 2, 50, 10)).toEqual([]);
  });

  it("keeps the stroke's look and stores pieces as offsets from their own start", () => {
    const [, right] = eraseInk(line({ color: "#ff0000", stroke: 6, marker: true }), 50, 50, 5);
    expect(right).toMatchObject({ color: "#ff0000", stroke: 6, marker: true, page: 0, y: 50 });
    expect(right.points[0]).toEqual([0, 0]);
  });
});

describe("eraseMarkup", () => {
  type Mark = Parameters<typeof eraseMarkup>[0];
  // Two marked lines, 100pt wide and 12pt tall.
  const mark = (style: Mark["style"] = "highlight", rects = [
    { x: 0, y: 0, width: 100, height: 12 },
    { x: 0, y: 14, width: 100, height: 12 },
  ]): Mark => ({ kind: "markup", style, page: 0, color: "#ffeb5a", rects });

  it("returns the mark unchanged when the eraser misses", () => {
    const m = mark();
    expect(eraseMarkup(m, 50, 60, 5)).toBe(m);
    expect(eraseMarkup(m, 150, 6, 5)).toBe(m);
  });

  it("takes a line's full height out when the eraser is taller than it, leaving the other line alone", () => {
    expect(eraseMarkup(mark(), 50, 6, 8)!.rects).toEqual([
      { x: 0, y: 0, width: 42, height: 12 },
      { x: 58, y: 0, width: 42, height: 12 },
      { x: 0, y: 14, width: 100, height: 12 },
    ]);
  });

  it("leaves highlight above and below a small eraser in a tall highlight", () => {
    const tall = mark("highlight", [{ x: 0, y: 0, width: 100, height: 40 }]);
    const rects = eraseMarkup(tall, 50, 20, 5)!.rects;
    expect(rects).toContainEqual({ x: 45, y: 0, width: 10, height: 15 });
    expect(rects).toContainEqual({ x: 45, y: 25, width: 10, height: 15 });
    expect(rects).toContainEqual({ x: 0, y: 0, width: 45, height: 40 });
    expect(rects).toContainEqual({ x: 55, y: 0, width: 45, height: 40 });
  });

  it("shortens a line from its end", () => {
    expect(eraseMarkup(mark(), 100, 6, 10)!.rects[0]).toEqual({ x: 0, y: 0, width: 90, height: 12 });
  });

  it("cuts an underline only where the eraser crosses the line itself", () => {
    const m = mark("underline");
    // Over the middle of the words, away from the underline near the bottom: untouched.
    expect(eraseMarkup(m, 50, 4, 3)).toBe(m);
    // On the underline (at 94% of the first line's height).
    const cut = eraseMarkup(m, 50, 11.28, 3)!.rects;
    expect(cut).toHaveLength(3);
    expect(cut[0].width).toBeLessThan(47.5);
    expect(cut[1].x).toBeGreaterThan(52.5);
  });

  it("cuts a strikethrough through the middle of the line", () => {
    const m = mark("strike");
    expect(eraseMarkup(m, 50, 11.5, 3)).toBe(m);
    expect(eraseMarkup(m, 50, 6.6, 3)!.rects).toHaveLength(3);
  });

  it("joins pieces back up so erasing doesn't pile up boxes, and returns null once everything is gone", () => {
    const tall = mark("highlight", [{ x: 0, y: 0, width: 100, height: 40 }]);
    let m: Mark | null = tall;
    for (let x = 0; x <= 100; x += 2) m = m && eraseMarkup(m, x, 20, 5);
    // A strip above and below the erased band remain, each one box.
    expect(m!.rects).toEqual([
      { x: 0, y: 0, width: 100, height: 15 },
      { x: 0, y: 25, width: 100, height: 15 },
    ]);
    expect(eraseMarkup(mark("highlight", [{ x: 0, y: 0, width: 10, height: 12 }]), 5, 6, 8)).toBeNull();
  });
});

describe("eraseShape", () => {
  type Shape = Parameters<typeof eraseShape>[0];
  type Poly = Extract<EditItem, { kind: "poly" }>;
  const base = { page: 0, color: "#ff0000", stroke: 2 };
  const rect: Shape = { ...base, kind: "rect", x: 0, y: 0, width: 100, height: 50, fill: null };
  const line: Shape = { ...base, kind: "line", x: 0, y: 0, x2: 100, y2: 0 };
  const ends = (p: Poly) => [p.points[0], p.points[p.points.length - 1]].map(([dx, dy]) => [p.x + dx, p.y + dy]);

  it("leaves a shape alone when the eraser misses it", () => {
    expect(eraseShape(rect, 50, 25, 5)).toEqual([rect]);
    expect(eraseShape(line, 50, 30, 5)).toEqual([line]);
  });

  it("cuts a gap in a line where the eraser crosses it", () => {
    const pieces = eraseShape(line, 50, 0, 5) as Poly[];
    expect(pieces).toHaveLength(2);
    expect(pieces.every((p) => p.kind === "poly" && !p.closed && p.color === "#ff0000" && p.stroke === 2)).toBe(true);
    const [[a], [, b]] = [ends(pieces[0]), ends(pieces[1])];
    expect(a).toEqual([0, 0]);
    expect(b).toEqual([100, 0]);
    expect(ends(pieces[0])[1][0]).toBeLessThanOrEqual(44);
    expect(ends(pieces[1])[0][0]).toBeGreaterThanOrEqual(56);
  });

  it("opens a rectangle into one piece that runs round the corner it started from", () => {
    const pieces = eraseShape(rect, 50, 50, 5) as Poly[];
    expect(pieces).toHaveLength(1);
    const [start, end] = ends(pieces[0]);
    expect(start[1]).toBe(50);
    expect(end[1]).toBe(50);
    expect(pieces[0].points.some(([dx, dy]) => pieces[0].x + dx === 0 && pieces[0].y + dy === 0)).toBe(true);
  });

  it("cuts ellipses, clouds and polygons too", () => {
    const ellipse: Shape = { ...rect, kind: "ellipse" };
    const cloud: Shape = { ...rect, cloud: true };
    const polygon: Shape = { ...base, kind: "poly", x: 0, y: 0, points: [[0, 0], [100, 0], [50, 50]], closed: true, fill: null };
    expect(eraseShape(ellipse, 100, 25, 5)).toHaveLength(1);
    expect(eraseShape(cloud, 50, 0, 5)).not.toEqual([cloud]);
    expect(eraseShape(polygon, 50, 0, 5)).toHaveLength(1);
  });

  it("splits an open polyline in two", () => {
    const polyline: Shape = { ...base, kind: "poly", x: 0, y: 0, points: [[0, 0], [100, 0], [100, 100]], closed: false, fill: null };
    expect(eraseShape(polyline, 50, 0, 5)).toHaveLength(2);
  });

  it("removes a shape the eraser covers completely", () => {
    expect(eraseShape({ ...line, x2: 4 }, 2, 0, 10)).toEqual([]);
  });

  it("keeps an arrowhead whole when only the shaft is cut, and drops it when touched", () => {
    const arrow: Shape = { ...line, arrow: true };
    const cut = eraseShape(arrow, 30, 0, 5) as Poly[];
    expect(cut).toHaveLength(3);
    expect(cut[2]).toMatchObject({ closed: true, fill: "#ff0000", stroke: 0 });
    expect(cut[2].points).toHaveLength(3);
    const tipGone = eraseShape(arrow, 99, 0, 3) as Poly[];
    expect(tipGone.every((p) => !p.closed)).toBe(true);
  });

  it("returns null for a filled shape, which goes whole", () => {
    expect(eraseShape({ ...rect, fill: "#00ff00" }, 50, 0, 5)).toBeNull();
  });
});

describe("more shapes", () => {
  const line = (extra: object = {}) => ({ kind: "line", page: 0, x: 10, y: 20, x2: 110, y2: 20, color: "#ff0000", stroke: 2, ...extra }) as Extract<EditItem, { kind: "line" }>;
  const poly = (extra: object = {}) =>
    ({ kind: "poly", page: 0, x: 10, y: 20, points: [[0, 0], [50, 0], [50, 40]], closed: false, color: "#000000", fill: null, stroke: 2, ...extra }) as Extract<EditItem, { kind: "poly" }>;

  it("ends an arrow in a head pointing along the line, with the shaft stopping at its base", () => {
    const { stroke, head } = linePaths(line({ arrow: true }));
    // Head 8pt long (the minimum) for a 2pt line, so the shaft stops at x = 102.
    expect(stroke).toEqual([
      { op: "M", p: [10, 20] },
      { op: "L", p: [102, 20] },
    ]);
    expect(head![0]).toEqual({ op: "M", p: [110, 20] });
    expect(head!.slice(1, 3).map((c) => ("p" in c ? c.p.map(Math.round) : null))).toEqual([
      [102, 24],
      [102, 16],
    ]);
  });

  it("has no head on a plain line", () => {
    expect(linePaths(line()).head).toBeNull();
  });

  it("bends an arc like a quarter ellipse: leaving vertically, arriving horizontally", () => {
    const [, curve] = linePaths(line({ curve: true, y2: 120 })).stroke;
    expect(curve).toMatchObject({ op: "C", p: [110, 120] });
    if (curve.op !== "C") throw new Error();
    expect(curve.c1[0]).toBe(10);
    expect(curve.c2[1]).toBe(120);
  });

  it("points an arrow on an arc the way the curve arrives", () => {
    const { head } = linePaths(line({ curve: true, arrow: true, y2: 120 }));
    // Arriving sideways, so the head's back corners sit level with each other, behind the point.
    const [, a, b] = head!;
    if (a.op !== "L" || b.op !== "L") throw new Error();
    expect(a.p[0]).toBeCloseTo(b.p[0]);
    expect(a.p[0]).toBeLessThan(110);
  });

  it("walks a cloud's outline in bumps that return to the start", () => {
    const path = cloudPath({ x: 0, y: 0, width: 100, height: 40 });
    expect(path[0]).toEqual({ op: "M", p: [0, 0] });
    expect(path[path.length - 1]).toEqual({ op: "Z" });
    // Bumps about 10pt wide: 10 along each long side, 4 down each short one.
    expect(path.filter((c) => c.op === "C")).toHaveLength(28);
    // The first bump bulges up, out of the box.
    const first = path[1];
    if (first.op !== "C") throw new Error();
    expect(first.c1[1]).toBeLessThan(0);
  });

  it("draws polylines open and polygons closed", () => {
    expect(polyPath(poly()).map((c) => c.op)).toEqual(["M", "L", "L"]);
    expect(polyPath(poly({ closed: true })).map((c) => c.op)).toEqual(["M", "L", "L", "Z"]);
    expect(pathD(polyPath(poly({ closed: true })))).toBe("M10,20L60,20L60,60Z");
  });

  it("saves arrows with a filled head", async () => {
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [line({ arrow: true })]));
    expect(content).toContain("10 780 m\n102 780 l\nS");
    expect(content).toMatch(/110 780 m\n102 \S+ l\n102 \S+ l\nh\nf/);
  });

  it("saves arcs as curves", async () => {
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [line({ curve: true, y2: 120 })]));
    expect(content).toMatch(/10 780 m\n10 \S+ \S+ 680 110 680 c\nS/);
  });

  it("saves polygons closed and filled, and polylines open", async () => {
    const [closed] = await pageContents(await applyEdits(await pdf([{}]), [poly({ closed: true, fill: "#ffff00" })]));
    expect(closed).toContain("1 1 0 rg");
    expect(closed).toContain("10 780 m\n60 780 l\n60 740 l\nh\nB");
    const [open] = await pageContents(await applyEdits(await pdf([{}]), [poly({ fill: "#ffff00" })]));
    expect(open).toContain("10 780 m\n60 780 l\n60 740 l\nS");
    expect(open).not.toContain(" rg");
  });

  it("saves clouds as bumps, filled when asked", async () => {
    const cloud = { kind: "rect", page: 0, x: 10, y: 20, width: 100, height: 40, color: "#000000", fill: "#00ff00", stroke: 2, cloud: true } as EditItem;
    const [content] = await pageContents(await applyEdits(await pdf([{}]), [cloud]));
    expect(content.match(/ c\n/g)).toHaveLength(28);
    expect(content).toMatch(/h\nB/);
  });
});

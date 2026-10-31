import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream, degrees } from "pdf-lib";
import { applyEdits, type EditItem } from "./pdf-editor";
import { STANDARD_STAMPS, stampLayout, stampName, stampSize, type Stamp } from "./pdf-stamps";

/** One unit per letter, so sizes are easy to check. */
const perLetter = (text: string) => text.length;

const approved: Stamp = { text: "APPROVED", color: "#3d6b21", shape: "box" };
const signHere: Stamp = { text: "SIGN HERE", color: "#c0503c", shape: "flag" };
const tick: Stamp = { text: "", color: "#4f9a2b", shape: "check" };

async function stamped(stamp: Stamp, rotation = 0) {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]).setRotation(degrees(rotation));
  const item = { kind: "stamp", page: 0, x: 100, y: 50, width: 120, height: 28, ...stamp } as EditItem;
  const out = await PDFDocument.load(await applyEdits(await doc.save(), [item]));
  const [ref] = out.getPage(0).node.Annots()!.asArray();
  const annot = out.context.lookup(ref) as PDFDict;
  const look = out.context.lookup(annot.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N"))) as PDFRawStream;
  return { annot, look, content: new TextDecoder().decode(decodePDFRawStream(look).decode()) };
}

describe("STANDARD_STAMPS", () => {
  it("has the usual office stamps, the sign-here flags and a tick and cross, with no repeats", () => {
    const names = STANDARD_STAMPS.map(stampName);
    expect(names).toContain("APPROVED");
    expect(names).toContain("SIGN HERE");
    expect(names).toEqual(expect.arrayContaining(["Check mark", "Cross"]));
    expect(new Set(names).size).toBe(names.length);
    expect(STANDARD_STAMPS.every((s) => /^#[0-9a-f]{6}$/.test(s.color))).toBe(true);
  });
});

describe("stampSize", () => {
  it("hugs the words, so longer stamps are wider", () => {
    const short = stampSize({ ...approved, text: "SOLD" }, perLetter);
    const long = stampSize(approved, perLetter);
    expect(short.height).toBe(long.height);
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("makes ticks and crosses square", () => {
    const { width, height } = stampSize(tick, perLetter);
    expect(width).toBe(height);
  });
});

describe("stampLayout", () => {
  const box = { x: 0, y: 0, ...stampSize(approved, perLetter) };

  it("centres the words in a box tinted from the stamp's colour", () => {
    const look = stampLayout({ ...approved, ...box }, perLetter);
    expect(look.text!.color).toBe("#3d6b21");
    expect(look.text!.cx).toBeCloseTo(box.width / 2);
    expect(look.fill).not.toBe("#3d6b21");
    expect(look.frame!.at(-1)).toEqual({ op: "Z" });
  });

  it("shrinks the words to fit when the stamp is squeezed", () => {
    const full = stampLayout({ ...approved, ...box }, perLetter).text!.size;
    const narrow = stampLayout({ ...approved, ...box, width: box.width / 2 }, perLetter).text!.size;
    expect(narrow).toBeLessThan(full);
  });

  it("points a flag left and writes on it in black", () => {
    const look = stampLayout({ ...signHere, x: 0, y: 0, width: 100, height: 20 }, perLetter);
    expect(look.text!.color).toBe("#000000");
    expect(look.frame).toContainEqual({ op: "L", p: [0, 10] });
  });

  it("draws a tick or cross as strokes with no words", () => {
    const look = stampLayout({ ...tick, x: 0, y: 0, width: 24, height: 24 }, perLetter);
    expect(look.text).toBeNull();
    expect(look.frame).toBeNull();
    expect(look.mark!.length).toBe(3);
    expect(stampLayout({ ...tick, shape: "cross", x: 0, y: 0, width: 24, height: 24 }, perLetter).mark!.filter((c) => c.op === "M")).toHaveLength(2);
  });
});

describe("saving stamps", () => {
  it("saves a Stamp annotation over the box, named for screen readers", async () => {
    const { annot } = await stamped(approved);
    expect(annot.get(PDFName.of("Subtype"))).toBe(PDFName.of("Stamp"));
    expect(annot.lookup(PDFName.of("Contents"), PDFHexString).decodeText()).toBe("APPROVED");
    const rect = annot.lookup(PDFName.of("Rect"), PDFArray).asArray().map((n) => (n as PDFNumber).asNumber());
    // Seen box (100, 50)–(220, 78) on an 800pt-tall page, padded by the border.
    expect(rect[0]).toBeLessThan(100);
    expect(rect[2]).toBeGreaterThan(220);
    expect(rect[1]).toBeLessThan(722);
    expect(rect[3]).toBeGreaterThan(750);
  });

  it("draws the border and the words in Helvetica Bold Oblique in its own look", async () => {
    const { look, content } = await stamped(approved);
    expect(content).toMatch(/\nB\n/);
    expect(content).toContain("/F1 ");
    expect(content).toMatch(/1 0 -?0 1 [\d.]+ [\d.]+ Tm/);
    const font = look.dict.lookup(PDFName.of("Resources"), PDFDict).lookup(PDFName.of("Font"), PDFDict).lookup(PDFName.of("F1"), PDFDict);
    expect(font.get(PDFName.of("BaseFont"))).toBe(PDFName.of("Helvetica-BoldOblique"));
  });

  it("strokes a tick without any text", async () => {
    const { content } = await stamped(tick);
    expect(content).not.toContain("BT");
    expect(content).toMatch(/l\nS/);
  });

  it("turns the words with the page, so they read across it as seen", async () => {
    const { content } = await stamped(approved, 90);
    expect(content).toMatch(/0 1 -1 0 [\d.]+ [\d.]+ Tm/);
  });
});

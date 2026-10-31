import {
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  PDFHexString,
  PDFString,
  StandardFonts,
  appendBezierCurve,
  beginText,
  endText,
  closePath,
  degrees,
  fill as fillPath,
  fillAndStroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineCap,
  setLineJoin,
  setFillingColor,
  setGraphicsState,
  setFontAndSize,
  setLineWidth,
  setTextMatrix,
  showText,
  setStrokingColor,
  stroke,
  type PDFOperator,
  type PDFPage,
} from "pdf-lib";
import { hexRgb } from "./pdf-colors";
import { PDF_FONTS, type PdfFont } from "./pdf-fonts";
import type { EmbeddableType } from "./images-to-pdf";
import { seenToUser } from "./pdf-page-numbers";
import { stampLayout, stampName, type Stamp } from "./pdf-stamps";

/**
 * Additions to a PDF, in points on the page as seen (rotation applied, crop box only), measured from
 * its top-left corner like the screen.
 */
export type EditItem =
  /**
   * Text. Edited page text also has `cover`, a box in the page's own background colour hiding the words it
   * replaces, and `leading`, the original distance between baselines.
   */
  | ({ kind: "text"; page: number; x: number; y: number; text: string; cover?: Box & { color: string }; leading?: number } & TextStyle)
  /** Marks on the page's own text, one box per line covered (or one free box on pages without text). */
  | { kind: "markup"; style: MarkupStyle; page: number; rects: Box[]; color: string }
  /** `fill` null leaves the inside see-through. `cloud` draws a rectangle's outline as a row of bumps. */
  | { kind: "rect" | "ellipse"; page: number; x: number; y: number; width: number; height: number; color: string; fill: string | null; stroke: number; cloud?: boolean }
  /** From (x, y) to (x2, y2): straight, or a quarter curve (`curve`), with an arrowhead at the end (`arrow`). */
  | { kind: "line"; page: number; x: number; y: number; x2: number; y2: number; color: string; stroke: number; arrow?: boolean; curve?: boolean }
  /** Corners as offsets from (x, y); `closed` joins the last back to the first, making a polygon that can be filled. */
  | { kind: "poly"; page: number; x: number; y: number; points: [number, number][]; closed: boolean; color: string; fill: string | null; stroke: number }
  | { kind: "comment"; page: number; x: number; y: number; text: string }
  /** A rubber stamp ("APPROVED", "SIGN HERE", a tick…) filling the box. */
  | ({ kind: "stamp"; page: number; x: number; y: number; width: number; height: number } & Stamp)
  /**
   * A picture (logo, photo, stamp), already a PNG or JPEG the PDF can hold. x, y, width and height are the
   * box it fills as seen; `rotation` turns it clockwise inside that box.
   */
  | { kind: "image"; page: number; x: number; y: number; width: number; height: number; rotation: ImageRotation; bytes: ArrayBuffer; type: EmbeddableType }
  /**
   * A freehand stroke: `points` are offsets from (x, y), so moving it only changes x and y. `marker` draws
   * it like a highlighter pen, tinting what's underneath instead of covering it.
   */
  | { kind: "ink"; page: number; x: number; y: number; points: [number, number][]; color: string; stroke: number; marker: boolean };

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MarkupStyle = "highlight" | "underline" | "strike" | "squiggly";

const MARKUP_SUBTYPE: Record<MarkupStyle, string> = { highlight: "Highlight", underline: "Underline", strike: "StrikeOut", squiggly: "Squiggly" };

export type ImageRotation = 0 | 90 | 180 | 270;

export type TextAlign = "left" | "center" | "right";

export interface TextStyle {
  font: PdfFont;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** "#rrggbb". */
  color: string;
  /** Fills the box behind the text; null for none. */
  background: string | null;
  /** How lines line up with each other inside the text's box. */
  align: TextAlign;
  /** 0–1, for the text, its underline and its background. */
  opacity: number;
}

/** Sticky notes are drawn this big, in points, by most readers. */
export const COMMENT_SIZE = 20;
/** How far the letters reach above the baseline, as a share of the size (from each font's metrics). */
export const TEXT_ASCENT: Record<PdfFont, number> = { sans: 0.718, serif: 0.683, mono: 0.629 };
/** Line spacing for text, as a multiple of its size. */
export const LINE_HEIGHT = 1.2;
/** Underline position below the baseline and its thickness, as shares of the size. */
export const UNDERLINE_OFFSET = 0.12;
export const UNDERLINE_THICKNESS = 0.06;

export type EditProgress = { phase: "reading" } | { phase: "editing"; done: number; total: number } | { phase: "saving" };

/** The size of a page as seen: its crop box, turned by its rotation. */
export function seenSize(page: PDFPage): { width: number; height: number } {
  const box = page.getCropBox();
  return page.getRotation().angle % 180 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
}

const fillColor = (color: string | null) => (color ? rgb(...hexRgb(color)) : undefined);

/** Maps a top-left-origin point on the page as seen to the page's drawing coordinates. */
function toUser(page: PDFPage, x: number, y: number): [number, number] {
  return seenToUser(page.getCropBox(), page.getRotation().angle, [x, seenSize(page).height - y]);
}

/** A seen box as an upright box in drawing coordinates; pages only turn in quarter turns, so it stays a box. */
function userBox(page: PDFPage, x: number, y: number, width: number, height: number) {
  const [x1, y1] = toUser(page, x, y);
  const [x2, y2] = toUser(page, x + width, y + height);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/**
 * Adds an annotation with its own drawn look (`ops`, in page coordinates), so every reader shows it the same
 * way while still letting people select, edit or delete it. `points` are the corners it must cover.
 */
function annotate(
  doc: PDFDocument,
  page: PDFPage,
  subtype: string,
  points: [number, number][],
  pad: number,
  ops: PDFOperator[],
  extra: Record<string, unknown>,
  multiply: boolean,
  resources: Record<string, unknown> = {},
) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const rect = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  // Multiply tints the page like a marker: dark text under it stays dark.
  const look = doc.context.formXObject(multiply ? [setGraphicsState("Tint"), ...ops] : ops, {
    BBox: rect,
    Resources: { ...(multiply && { ExtGState: { Tint: { Type: "ExtGState", BM: "Multiply" } } }), ...resources },
  });
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: subtype,
    Rect: rect,
    // Print it, like the rest of the page.
    F: 4,
    M: PDFString.fromDate(new Date()),
    AP: { N: doc.context.register(look) },
    ...extra,
  });
  page.node.addAnnot(doc.context.register(annot));
}

/** The drawing for one markup over boxes on the page as seen, mapped to page coordinates with `at`. */
function markupOps(style: MarkupStyle, rects: Box[], at: (x: number, y: number) => [number, number]): PDFOperator[] {
  if (style === "highlight")
    return [
      ...rects.flatMap(({ x, y, width: w, height: h }) => [moveTo(...at(x, y)), lineTo(...at(x + w, y)), lineTo(...at(x + w, y + h)), lineTo(...at(x, y + h)), closePath()]),
      fillPath(),
    ];
  return rects.flatMap(({ x, y, width: w, height: h }) => {
    const thickness = Math.max(0.5, h * 0.07);
    const line = (ly: number) => [moveTo(...at(x, ly)), lineTo(...at(x + w, ly))];
    let path: PDFOperator[];
    if (style !== "squiggly") path = line(y + h * MARK_LINE_AT[style]);
    else {
      // A zigzag along the bottom, a sixth of the line height per step.
      const step = h / 6;
      const base = y + h * MARK_LINE_AT.squiggly;
      path = [moveTo(...at(x, base))];
      for (let i = 1, px = x + step; px <= x + w + 0.01; i++, px += step) path.push(lineTo(...at(Math.min(px, x + w), base + (i % 2 ? -1 : 1) * h * 0.05)));
    }
    return [setLineWidth(thickness), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round), ...path, stroke()];
  });
}

/**
 * Draws `items` onto a copy of the PDF. Text, shapes and pictures become part of the page. Text marks,
 * freehand strokes and comments become annotations: they look the same in every reader, and people can
 * still select, edit or delete them there. Throws on encrypted or broken files.
 */
export async function applyEdits(input: Uint8Array, items: EditItem[], onProgress: (progress: EditProgress) => void = () => {}): Promise<Uint8Array> {
  onProgress({ phase: "reading" });
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const fonts = new Map<string, Awaited<ReturnType<typeof doc.embedFont>>>();
  // The same picture placed several times is stored in the file once.
  const images = new Map<ArrayBuffer, Awaited<ReturnType<typeof doc.embedPng>>>();

  for (const [i, item] of items.entries()) {
    onProgress({ phase: "editing", done: i, total: items.length });
    const page = doc.getPage(item.page);

    if (item.kind === "text") {
      const name = PDF_FONTS[item.font][(item.bold ? 1 : 0) + (item.italic ? 2 : 0)];
      const font = fonts.get(name) ?? (await doc.embedFont(name));
      fonts.set(name, font);
      const { size, opacity } = item;
      const color = rgb(...hexRgb(item.color));
      const lines = item.text.split("\n");
      const widths = lines.map((line) => font.widthOfTextAtSize(line, size));
      const boxWidth = Math.max(...widths);
      const lineHeight = item.leading ?? size * LINE_HEIGHT;
      if (item.cover) page.drawRectangle({ ...userBox(page, item.cover.x, item.cover.y, item.cover.width, item.cover.height), color: rgb(...hexRgb(item.cover.color)) });
      if (item.background) page.drawRectangle({ ...userBox(page, item.x, item.y, boxWidth, lines.length * lineHeight), color: rgb(...hexRgb(item.background)), opacity });
      // Line by line, so each can be shifted for alignment; the box's top is where the letters start.
      for (const [i, line] of lines.entries()) {
        const left = item.x + (item.align === "center" ? (boxWidth - widths[i]) / 2 : item.align === "right" ? boxWidth - widths[i] : 0);
        const baseline = item.y + size * TEXT_ASCENT[item.font] + i * lineHeight;
        const [x, y] = toUser(page, left, baseline);
        if (line) page.drawText(line, { x, y, font, size, color, opacity, rotate: degrees(page.getRotation().angle) });
        if (item.underline && widths[i]) {
          const under = baseline + size * UNDERLINE_OFFSET;
          const [x1, y1] = toUser(page, left, under);
          const [x2, y2] = toUser(page, left + widths[i], under);
          page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: size * UNDERLINE_THICKNESS, color, opacity });
        }
      }
    } else if (item.kind === "comment") {
      const rect = userBox(page, item.x, item.y, COMMENT_SIZE, COMMENT_SIZE);
      const note = doc.context.obj({
        Type: "Annot",
        Subtype: "Text",
        Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
        Contents: PDFHexString.fromText(item.text),
        Name: "Comment",
        C: [1, 0.85, 0.2],
        M: PDFString.fromDate(new Date()),
        // Print, and keep the note icon upright and the same size at any zoom.
        F: 4 | 8 | 16,
      });
      page.node.addAnnot(doc.context.register(note));
    } else if (item.kind === "stamp") {
      const name = StandardFonts.HelveticaBoldOblique;
      const font = fonts.get(name) ?? (await doc.embedFont(name));
      fonts.set(name, font);
      const at = (x: number, y: number) => toUser(page, x, y);
      const look = stampLayout(item, (text) => font.widthOfTextAtSize(text, 1));
      // Pages only turn in quarter turns: exact cosine and sine keep the matrix clean.
      const [cos, sin] = [[1, 0], [0, 1], [-1, 0], [0, -1]][(((page.getRotation().angle / 90) % 4) + 4) % 4];
      const ops: PDFOperator[] = [pushGraphicsState(), setStrokingColor(rgb(...hexRgb(item.color))), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round)];
      if (look.frame) ops.push(setFillingColor(rgb(...hexRgb(look.fill))), setLineWidth(look.frameWidth), ...pathOps(look.frame, at), fillAndStroke());
      if (look.mark) ops.push(setLineWidth(look.markWidth), ...pathOps(look.mark, at), stroke());
      if (look.text) {
        const { cx, baseline, size, color } = look.text;
        // Turned with the page, so the words read across the page as seen.
        const [tx, ty] = at(cx - font.widthOfTextAtSize(item.text, size) / 2, baseline);
        ops.push(
          beginText(),
          setFillingColor(rgb(...hexRgb(color))),
          setFontAndSize("F1", size),
          setTextMatrix(cos, sin, -sin, cos, tx, ty),
          showText(font.encodeText(item.text)),
          endText(),
        );
      }
      ops.push(popGraphicsState());
      const { x, y, width: w, height: h } = item;
      annotate(doc, page, "Stamp", [at(x, y), at(x + w, y + h)], look.frameWidth + look.markWidth, ops, { Name: "Draft", Contents: PDFHexString.fromText(stampName(item)), C: hexRgb(item.color) }, false, {
        Font: { F1: font.ref },
      });
    } else if (item.kind === "image") {
      const image = images.get(item.bytes) ?? (await (item.type === "png" ? doc.embedPng(item.bytes) : doc.embedJpg(item.bytes)));
      images.set(item.bytes, image);
      // pdf-lib turns a picture about its own bottom-left corner, so start from whichever corner of the box
      // that corner lands on after the turn: bottom-left, then top-left, top-right, bottom-right.
      const { x: left, y: top, width, height, rotation } = item;
      const corner = { 0: [left, top + height], 90: [left, top], 180: [left + width, top], 270: [left + width, top + height] }[rotation];
      const [x, y] = toUser(page, corner[0], corner[1]);
      const sideways = rotation % 180 !== 0;
      page.drawImage(image, {
        x,
        y,
        width: sideways ? height : width,
        height: sideways ? width : height,
        rotate: degrees(page.getRotation().angle - rotation),
      });
    } else if (item.kind === "markup") {
      if (!item.rects.length) continue;
      const color = hexRgb(item.color);
      const at = (x: number, y: number) => toUser(page, x, y);
      // Acrobat's corner order for each box: top-left, top-right, bottom-left, bottom-right as seen.
      const quads = item.rects.flatMap(({ x, y, width: w, height: h }) => [at(x, y), at(x + w, y), at(x, y + h), at(x + w, y + h)]);
      const ops = [item.style === "highlight" ? setFillingColor(rgb(...color)) : setStrokingColor(rgb(...color)), ...markupOps(item.style, item.rects, at)];
      annotate(doc, page, MARKUP_SUBTYPE[item.style], quads, 2, ops, { QuadPoints: quads.flat(), C: color }, item.style === "highlight");
    } else if (item.kind === "ink") {
      if (!item.points.length) continue;
      const points = item.points.map(([dx, dy]) => toUser(page, item.x + dx, item.y + dy));
      const [first, ...rest] = points;
      const color = hexRgb(item.color);
      // Round joins and caps keep a hand-drawn stroke smooth instead of spiky at sharp turns.
      const ops = [
        pushGraphicsState(),
        setStrokingColor(rgb(...color)),
        setLineWidth(item.stroke),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
        moveTo(...first),
        // A single dot still needs a segment to show its round cap.
        ...(rest.length ? rest : [first]).map(([x, y]) => lineTo(x, y)),
        stroke(),
        popGraphicsState(),
      ];
      annotate(doc, page, "Ink", points, item.stroke / 2 + 1, ops, { InkList: [points.flat()], C: color, BS: { W: item.stroke } }, item.marker);
    } else if (item.kind === "line" || item.kind === "poly" || (item.kind === "rect" && item.cloud)) {
      const at = (x: number, y: number) => toUser(page, x, y);
      const color = rgb(...hexRgb(item.color));
      const lines = item.kind === "line" ? linePaths(item) : null;
      const path = item.kind === "line" ? lines!.stroke : item.kind === "poly" ? polyPath(item) : cloudPath(item);
      const fill = item.kind === "rect" ? item.fill : item.kind === "poly" && item.closed ? item.fill : null;
      if (!path.length) continue;
      page.pushOperators(
        pushGraphicsState(),
        setStrokingColor(color),
        ...(fill ? [setFillingColor(rgb(...hexRgb(fill)))] : []),
        setLineWidth(item.stroke),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
        ...pathOps(path, at),
        fill ? fillAndStroke() : stroke(),
        ...(lines?.head ? [setFillingColor(color), ...pathOps(lines.head, at), fillPath()] : []),
        popGraphicsState(),
      );
    } else {
      const box = userBox(page, item.x, item.y, item.width, item.height);
      const color = rgb(...hexRgb(item.color));
      if (item.kind === "rect") {
        page.drawRectangle({ ...box, color: fillColor(item.fill), borderColor: color, borderWidth: item.stroke });
      } else {
        page.drawEllipse({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          xScale: box.width / 2,
          yScale: box.height / 2,
          color: fillColor(item.fill),
          borderColor: color,
          borderWidth: item.stroke,
        });
      }
    }
  }
  onProgress({ phase: "saving" });
  return doc.save({ useObjectStreams: true });
}

type InkItem = Extract<EditItem, { kind: "ink" }>;

/**
 * Rubs out the part of a freehand stroke within `radius` of (cx, cy), on the page as seen. Returns the pieces
 * left (none if it's all gone, the stroke unchanged if the eraser missed). Long segments are filled in with
 * points first, so the cut lands where the eraser touched rather than at the nearest drawn point.
 */
export function eraseInk(item: InkItem, cx: number, cy: number, radius: number): InkItem[] {
  const path = item.points.map(([dx, dy], i): PathCmd => ({ op: i ? "L" : "M", p: [item.x + dx, item.y + dy] }));
  const runs = cutPath(path, cx, cy, radius + item.stroke / 2, Math.max(0.5, radius / 2));
  return runs ? runs.map((run) => ({ ...item, ...offsets(run) })) : [item];
}

/** A run of points as a start (x, y) and offsets from it, rounded to a tenth of a point. */
function offsets(run: Pt[]): { x: number; y: number; points: [number, number][] } {
  const [x, y] = run[0];
  const round = (v: number) => Math.round(v * 10) / 10;
  return { x, y, points: run.map(([px, py]) => [round(px - x), round(py - y)]) };
}

/** Points along a path no more than `step` apart, one list per subpath; a closed subpath ends on its own first point. */
function pathPoints(path: PathCmd[], step: number): Pt[][] {
  const out: Pt[][] = [];
  let run: Pt[] = [];
  const to = (p: Pt) => {
    const prev = run[run.length - 1];
    const gap = prev ? Math.hypot(p[0] - prev[0], p[1] - prev[1]) : 0;
    for (let k = 1; k < gap / step; k++) run.push([prev[0] + ((p[0] - prev[0]) * k * step) / gap, prev[1] + ((p[1] - prev[1]) * k * step) / gap]);
    run.push(p);
  };
  for (const c of path) {
    if (c.op === "M") {
      if (run.length) out.push(run);
      run = [c.p];
    } else if (c.op === "L") to(c.p);
    else if (c.op === "Z") to(run[0]);
    else if (c.op === "C") {
      const p0 = run[run.length - 1];
      for (let i = 1; i <= 16; i++) {
        const t = i / 16;
        const [a, b, d, e] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3];
        to([a * p0[0] + b * c.c1[0] + d * c.c2[0] + e * c.p[0], a * p0[1] + b * c.c1[1] + d * c.c2[1] + e * c.p[1]]);
      }
    }
  }
  if (run.length) out.push(run);
  return out;
}

/**
 * The runs of a path left outside `reach` of (cx, cy), or null if the eraser missed it. Runs need two points,
 * so no stray dots are left, and a closed outline cut once stays one run through its start.
 */
function cutPath(path: PathCmd[], cx: number, cy: number, reach: number, step: number): Pt[][] | null {
  let touched = false;
  const runs = pathPoints(path, step).flatMap((points) => {
    const keep = points.map(([x, y]) => Math.hypot(x - cx, y - cy) > reach);
    if (keep.every(Boolean)) return [points];
    touched = true;
    const pieces: Pt[][] = [[]];
    points.forEach((p, i) => (keep[i] ? pieces[pieces.length - 1].push(p) : pieces.push([])));
    if (points.length > 2 && points[0] === points[points.length - 1] && keep[0] && pieces.length > 1) pieces[0] = [...pieces.pop()!, ...pieces[0].slice(1)];
    return pieces.filter((piece) => piece.length > 1);
  });
  return touched ? runs : null;
}

type ShapeItem = Extract<EditItem, { kind: "rect" | "ellipse" | "line" | "poly" }>;

/**
 * Rubs out the part of an unfilled shape's outline the eraser touches. What's left becomes open polylines in the
 * same colour and thickness; an arrowhead stays whole, or goes if touched. Returns the shape unchanged if the
 * eraser missed, and null for a filled shape, whose inside can't lose a piece.
 */
export function eraseShape(item: ShapeItem, cx: number, cy: number, radius: number): EditItem[] | null {
  if (item.kind !== "line" && item.fill && (item.kind !== "poly" || item.closed)) return null;
  const step = Math.max(0.5, radius / 2);
  const { x, y } = item;
  const [w, h] = item.kind === "rect" || item.kind === "ellipse" ? [item.width, item.height] : [0, 0];
  const lines = item.kind === "line" ? linePaths(item) : null;
  const outline: PathCmd[] =
    item.kind === "line" ? lines!.stroke
    : item.kind === "poly" ? polyPath(item)
    : item.kind === "ellipse" ? ellipsePath(item)
    : item.cloud ? cloudPath(item)
    : [{ op: "M", p: [x, y] }, { op: "L", p: [x + w, y] }, { op: "L", p: [x + w, y + h] }, { op: "L", p: [x, y + h] }, { op: "Z" }];
  const runs = cutPath(outline, cx, cy, radius + item.stroke / 2, step);
  const headHit = !!lines?.head && cutPath(lines.head, cx, cy, radius, step) !== null;
  if (!runs && !headHit) return [item];
  const piece = (run: Pt[], closed: boolean, fill: string | null, stroke: number): PolyItem => ({ kind: "poly", page: item.page, color: item.color, closed, fill, stroke, ...offsets(run) });
  const pieces = (runs ?? pathPoints(outline, step)).map((run) => piece(run, false, null, item.stroke));
  if (lines?.head && !headHit) pieces.push(piece(lines.head.flatMap((c) => (c.op === "Z" ? [] : [c.p])), true, item.color, 0));
  return pieces;
}

/** An ellipse filling a box, as four quarter curves. */
function ellipsePath({ x, y, width, height }: Box): PathCmd[] {
  const [rx, ry] = [width / 2, height / 2];
  const [cx, cy] = [x + rx, y + ry];
  const [kx, ky] = [KAPPA * rx, KAPPA * ry];
  return [
    { op: "M", p: [cx + rx, cy] },
    { op: "C", c1: [cx + rx, cy + ky], c2: [cx + kx, cy + ry], p: [cx, cy + ry] },
    { op: "C", c1: [cx - kx, cy + ry], c2: [cx - rx, cy + ky], p: [cx - rx, cy] },
    { op: "C", c1: [cx - rx, cy - ky], c2: [cx - kx, cy - ry], p: [cx, cy - ry] },
    { op: "C", c1: [cx + kx, cy - ry], c2: [cx + rx, cy - ky], p: [cx + rx, cy] },
    { op: "Z" },
  ];
}

type MarkupItem = Extract<EditItem, { kind: "markup" }>;
type LineItem = Extract<EditItem, { kind: "line" }>;
type PolyItem = Extract<EditItem, { kind: "poly" }>;

type Pt = [number, number];

/** A path on the page as seen, so the screen and the saved PDF draw the same shape. */
export type PathCmd = { op: "M" | "L"; p: Pt } | { op: "C"; c1: Pt; c2: Pt; p: Pt } | { op: "Z" };

/** Control-point distance that makes a cubic curve follow a quarter circle. */
const KAPPA = 0.5523;

/**
 * A line's path, and its arrowhead (to fill) when it has one. A curve bends like a quarter ellipse: it leaves
 * the start heading up or down and arrives at the end heading sideways.
 */
export function linePaths(item: LineItem): { stroke: PathCmd[]; head: PathCmd[] | null } {
  const start: Pt = [item.x, item.y];
  const end: Pt = [item.x2, item.y2];
  const c1: Pt = [item.x, item.y + KAPPA * (item.y2 - item.y)];
  const c2: Pt = [item.x2 - KAPPA * (item.x2 - item.x), item.y2];
  // The direction the line arrives in, for the arrowhead.
  const [fx, fy] = item.curve ? (Math.hypot(end[0] - c2[0], end[1] - c2[1]) > 0.01 ? c2 : start) : start;
  const len = Math.hypot(end[0] - fx, end[1] - fy);
  if (!item.arrow || len < 0.01) return { stroke: item.curve ? [{ op: "M", p: start }, { op: "C", c1, c2, p: end }] : [{ op: "M", p: start }, { op: "L", p: end }], head: null };
  const [ux, uy] = [(end[0] - fx) / len, (end[1] - fy) / len];
  const headLength = Math.max(8, item.stroke * 4);
  const halfWidth = headLength * 0.45;
  const base: Pt = [end[0] - ux * headLength, end[1] - uy * headLength];
  const head: PathCmd[] = [
    { op: "M", p: end },
    { op: "L", p: [base[0] - uy * halfWidth, base[1] + ux * halfWidth] },
    { op: "L", p: [base[0] + uy * halfWidth, base[1] - ux * halfWidth] },
    { op: "Z" },
  ];
  // A straight shaft stops at the head's base, so its round end doesn't poke past the point.
  const stroke: PathCmd[] = item.curve ? [{ op: "M", p: start }, { op: "C", c1, c2, p: end }] : [{ op: "M", p: start }, { op: "L", p: base }];
  return { stroke, head };
}

/** A cloud: the box's outline walked clockwise as a row of outward bumps, each about a quarter of the short side. */
export function cloudPath({ x, y, width, height }: Box): PathCmd[] {
  const bump = Math.min(24, Math.max(8, Math.min(width, height) / 4));
  const corners: Pt[] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  const path: PathCmd[] = [{ op: "M", p: corners[0] }];
  for (const [i, a] of corners.entries()) {
    const b = corners[(i + 1) % 4];
    const side = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.max(1, Math.round(side / bump));
    // Outward is to the left of travel on screen (y down), going clockwise.
    const [nx, ny] = [(b[1] - a[1]) / side, -(b[0] - a[0]) / side];
    for (let k = 0; k < count; k++) {
      const p0: Pt = [a[0] + ((b[0] - a[0]) * k) / count, a[1] + ((b[1] - a[1]) * k) / count];
      const p1: Pt = [a[0] + ((b[0] - a[0]) * (k + 1)) / count, a[1] + ((b[1] - a[1]) * (k + 1)) / count];
      // One cubic per bump: a half circle over the chord, pushed out by 4/3 of its radius.
      const lift = (4 / 3) * (side / count / 2);
      path.push({ op: "C", c1: [p0[0] + nx * lift, p0[1] + ny * lift], c2: [p1[0] + nx * lift, p1[1] + ny * lift], p: p1 });
    }
  }
  path.push({ op: "Z" });
  return path;
}

/** A polyline or polygon's path through its corners. */
export function polyPath(item: PolyItem): PathCmd[] {
  const [first, ...rest] = item.points.map(([dx, dy]): Pt => [item.x + dx, item.y + dy]);
  if (!first) return [];
  return [{ op: "M", p: first }, ...rest.map((p): PathCmd => ({ op: "L", p })), ...(item.closed ? [{ op: "Z" } as PathCmd] : [])];
}

/** A path as SVG path data. */
export function pathD(path: PathCmd[]): string {
  return path.map((c) => (c.op === "Z" ? "Z" : c.op === "C" ? `C${c.c1} ${c.c2} ${c.p}` : `${c.op}${c.p}`)).join("");
}

/** A path as PDF drawing commands, each point mapped to page coordinates with `at`. */
function pathOps(path: PathCmd[], at: (x: number, y: number) => Pt): PDFOperator[] {
  return path.map((c) =>
    c.op === "Z" ? closePath() : c.op === "C" ? appendBezierCurve(...at(...c.c1), ...at(...c.c2), ...at(...c.p)) : c.op === "M" ? moveTo(...at(...c.p)) : lineTo(...at(...c.p)),
  );
}

/** Where the line of an underline, strikethrough or squiggly sits in its box, as a share of the box's height. */
export const MARK_LINE_AT: Record<Exclude<MarkupStyle, "highlight">, number> = { underline: 0.94, strike: 0.55, squiggly: 0.92 };

/** Joins boxes that sit side by side at the same height, so repeated erasing doesn't pile up pieces. */
function mergeRow(rects: Box[]): Box[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.height - b.height || a.x - b.x);
  const out: Box[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - r.y) < 0.01 && Math.abs(last.height - r.height) < 0.01 && r.x - (last.x + last.width) < 0.01) {
      last.width = Math.max(last.x + last.width, r.x + r.width) - last.x;
    } else out.push({ ...r });
  }
  return out;
}

/**
 * Rubs out the part of a text mark the eraser (a circle of `radius` at cx, cy) touches. Highlights lose the
 * area under it, keeping any highlight above or below; underlines and the like are cut only where the eraser
 * crosses their line. Returns the mark unchanged if the eraser missed, or null once nothing is left.
 */
export function eraseMarkup(item: MarkupItem, cx: number, cy: number, radius: number): MarkupItem | null {
  let touched = false;
  const keep = (piece: Box) => piece.width >= 1 && piece.height >= 0.5;
  const rects = item.rects.flatMap((box) => {
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    if (item.style !== "highlight") {
      // Only the drawn line matters: how far the eraser reaches along it.
      const lineY = box.y + box.height * MARK_LINE_AT[item.style];
      const dy = Math.abs(cy - lineY);
      const reach = radius + Math.max(0.5, box.height * 0.07) / 2;
      if (dy >= reach) return [box];
      const half = Math.sqrt(reach * reach - dy * dy);
      if (cx + half <= box.x || cx - half >= right) return [box];
      touched = true;
      return [
        { ...box, width: cx - half - box.x },
        { ...box, x: cx + half, width: right - cx - half },
      ].filter(keep);
    }
    // The hole: the eraser's height inside the box, and its widest reach across that height.
    const top = Math.max(box.y, cy - radius);
    const end = Math.min(bottom, cy + radius);
    if (top >= end) return [box];
    const dy = cy < top ? top - cy : cy > end ? cy - end : 0;
    const half = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    const [from, to] = [Math.max(box.x, cx - half), Math.min(right, cx + half)];
    if (from >= to) return [box];
    touched = true;
    return [
      { ...box, width: from - box.x },
      { ...box, x: to, width: right - to },
      { x: from, y: box.y, width: to - from, height: top - box.y },
      { x: from, y: end, width: to - from, height: bottom - end },
    ].filter(keep);
  });
  if (!touched) return item;
  return rects.length ? { ...item, rects: mergeRow(rects) } : null;
}

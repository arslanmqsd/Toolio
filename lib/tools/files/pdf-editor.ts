import {
  BlendMode,
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  PDFHexString,
  PDFString,
  degrees,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
  type PDFPage,
} from "pdf-lib";
import { hexRgb } from "./pdf-colors";
import { PDF_FONTS, type PdfFont } from "./pdf-fonts";
import type { EmbeddableType } from "./images-to-pdf";
import { seenToUser } from "./pdf-page-numbers";

/**
 * Additions to a PDF, in points on the page as seen (rotation applied, crop box only), measured from
 * its top-left corner like the screen.
 */
export type EditItem =
  | ({ kind: "text"; page: number; x: number; y: number; text: string } & TextStyle)
  | { kind: "highlight"; page: number; x: number; y: number; width: number; height: number; color: string }
  /** `fill` null leaves the inside see-through. */
  | { kind: "rect" | "ellipse"; page: number; x: number; y: number; width: number; height: number; color: string; fill: string | null; stroke: number }
  | { kind: "line"; page: number; x: number; y: number; x2: number; y2: number; color: string; stroke: number }
  | { kind: "comment"; page: number; x: number; y: number; text: string }
  /** A freehand stroke: `points` are offsets from (x, y), so moving it only changes x and y. */
  /** A picture (logo, photo, stamp), already a PNG or JPEG the PDF can hold. */
  /** x, y, width and height are the box it fills as seen; `rotation` turns it clockwise inside that box. */
  | { kind: "image"; page: number; x: number; y: number; width: number; height: number; rotation: ImageRotation; bytes: ArrayBuffer; type: EmbeddableType }
  | { kind: "ink"; page: number; x: number; y: number; points: [number, number][]; color: string; stroke: number };

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

const fill = (color: string | null) => (color ? rgb(...hexRgb(color)) : undefined);

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
 * Draws `items` onto a copy of the PDF. Text, shapes and highlights become part of the page; comments
 * become sticky-note annotations that readers list in their comments pane. Throws on encrypted or broken files.
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
      const lineHeight = size * LINE_HEIGHT;
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
    } else if (item.kind === "ink") {
      if (!item.points.length) continue;
      const [first, ...rest] = item.points.map(([dx, dy]) => toUser(page, item.x + dx, item.y + dy));
      // Round joins and caps keep a hand-drawn stroke smooth instead of spiky at sharp turns.
      page.pushOperators(
        pushGraphicsState(),
        setStrokingColor(rgb(...hexRgb(item.color))),
        setLineWidth(item.stroke),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
        moveTo(...first),
        // A single dot still needs a segment to show its round cap.
        ...(rest.length ? rest : [first]).map(([x, y]) => lineTo(x, y)),
        stroke(),
        popGraphicsState(),
      );
    } else if (item.kind === "line") {
      const [x1, y1] = toUser(page, item.x, item.y);
      const [x2, y2] = toUser(page, item.x2, item.y2);
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: item.stroke, color: rgb(...hexRgb(item.color)), lineCap: LineCapStyle.Round });
    } else {
      const box = userBox(page, item.x, item.y, item.width, item.height);
      const color = rgb(...hexRgb(item.color));
      if (item.kind === "highlight") {
        // Multiply tints the page like a marker: dark text under it stays dark.
        page.drawRectangle({ ...box, color, blendMode: BlendMode.Multiply });
      } else if (item.kind === "rect") {
        page.drawRectangle({ ...box, color: fill(item.fill), borderColor: color, borderWidth: item.stroke });
      } else {
        page.drawEllipse({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          xScale: box.width / 2,
          yScale: box.height / 2,
          color: fill(item.fill),
          borderColor: color,
          borderWidth: item.stroke,
        });
      }
    }
  }
  onProgress({ phase: "saving" });
  return doc.save({ useObjectStreams: true });
}

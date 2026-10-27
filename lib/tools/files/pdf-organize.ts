import { PDFDocument, degrees } from "pdf-lib";

/** One page of the result: which original page (zero-based) and how far to turn it, in quarter turns. */
export interface PageEdit {
  index: number;
  /** Clockwise, added to the page's own rotation: 1 = 90°, -1 = 90° anticlockwise. */
  turns: number;
}

/** Normalises any number of quarter turns to 0, 90, 180 or 270 degrees. */
export const turnsToDegrees = (turns: number) => (((turns % 4) + 4) % 4) * 90;

/**
 * A new PDF with the pages in `edits` order, each rotated as asked. Pages left out are dropped.
 * Throws on encrypted or broken files, and when no pages are left.
 */
export async function organizePages(input: Uint8Array, edits: PageEdit[]): Promise<Uint8Array> {
  if (edits.length === 0) throw new Error("A PDF needs at least one page.");
  const source = await PDFDocument.load(input, { updateMetadata: false });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(source, edits.map((e) => e.index));
  pages.forEach((page, i) => {
    const turned = page.getRotation().angle + turnsToDegrees(edits[i].turns);
    page.setRotation(degrees(turned % 360));
    out.addPage(page);
  });
  return out.save({ useObjectStreams: true });
}

/**
 * The same PDF with every page turned `turns` quarter turns clockwise on top of its own rotation. Edits
 * the file in place, unlike organizePages, so bookmarks, links and form fields survive.
 */
export async function rotatePdf(input: Uint8Array, turns: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  for (const page of doc.getPages()) page.setRotation(degrees((page.getRotation().angle + turnsToDegrees(turns)) % 360));
  return doc.save({ useObjectStreams: true });
}

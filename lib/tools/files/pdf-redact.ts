/**
 * Redaction that removes, not just covers: each page with redactions is replaced by a picture of itself with
 * the marked areas burned in black, so the words and images under them are gone from the file.
 */

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, type PDFObject } from "pdf-lib";
import type { EditProgress } from "./pdf-editor";
import { parsePageRanges, rangeIndexes } from "./pdf-split";

/**
 * Where `query` appears in a page's letters, as [first, last] letter indexes. Ignores case and whitespace,
 * because pdf.js often drops the space between text pieces ("John" "Smith" reads "JohnSmith").
 */
export function findMatches(letters: string[], query: string): [number, number][] {
  const needle = query.toLowerCase().replace(/\s+/g, "");
  if (!needle) return [];
  // The letters with whitespace taken out, and where each one sits in `letters`.
  let hay = "";
  const at: number[] = [];
  for (const [i, letter] of letters.entries()) {
    if (/\s/.test(letter)) continue;
    const lower = letter.toLowerCase();
    // Some letters lower-case to two (İ), which would shift every index after it.
    hay += lower.length === letter.length ? lower : letter;
    for (let k = 0; k < letter.length; k++) at.push(i);
  }
  const matches: [number, number][] = [];
  for (let from = hay.indexOf(needle); from !== -1; from = hay.indexOf(needle, from + needle.length)) {
    matches.push([at[from], at[from + needle.length - 1]]);
  }
  return matches;
}

/** A page to replace with a picture: zero-based index, a PNG of it with the redactions burned in, its size in points as seen. */
export interface FlatPage {
  index: number;
  png: ArrayBuffer;
  width: number;
  height: number;
}

/** Whether an object mentions any of `refs`, looking through nested dictionaries and arrays. */
function mentions(doc: PDFDocument, obj: PDFObject | undefined, refs: Set<PDFRef>, seen = new Set<PDFObject>()): boolean {
  if (!obj || seen.has(obj)) return false;
  seen.add(obj);
  if (obj instanceof PDFRef) return refs.has(obj) || mentions(doc, doc.context.lookup(obj), refs, seen);
  if (obj instanceof PDFArray) return obj.asArray().some((o) => mentions(doc, o, refs, seen));
  if (obj instanceof PDFDict) return [...obj.entries()].some(([key, o]) => key.asString() !== "/P" && key.asString() !== "/Parent" && mentions(doc, o, refs, seen));
  return false;
}

/**
 * A new PDF with the `flat` pages swapped for their pictures and every other page copied as it is.
 *
 * Built as a fresh file on purpose: pdf-lib saves every object it loaded, used or not, so editing the original
 * in place would leave the hidden text in the file. Only what the kept pages use comes across, so bookmarks,
 * document info and attachments are left behind too. Links on kept pages that point at a replaced page are
 * dropped, since copying them would bring the old page along.
 */
export async function redactPages(input: Uint8Array, flat: FlatPage[], onProgress: (progress: EditProgress) => void = () => {}): Promise<Uint8Array> {
  onProgress({ phase: "reading" });
  const source = await PDFDocument.load(input, { updateMetadata: false });
  const pages = source.getPages();
  const byIndex = new Map(flat.map((f) => [f.index, f]));
  const replaced = new Set(flat.map((f) => pages[f.index].ref));

  const keep = source.getPageIndices().filter((i) => !byIndex.has(i));
  for (const i of keep) {
    const annots = pages[i].node.Annots();
    if (!annots) continue;
    const safe = annots.asArray().filter((a) => !mentions(source, a, replaced));
    if (safe.length < annots.size()) pages[i].node.set(PDFName.of("Annots"), source.context.obj(safe));
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(source, keep);
  let next = 0;
  for (const [n, i] of source.getPageIndices().entries()) {
    onProgress({ phase: "editing", done: n, total: pages.length });
    const page = byIndex.get(i);
    if (!page) {
      out.addPage(copied[next++]);
      continue;
    }
    const image = await out.embedPng(page.png);
    out.addPage([page.width, page.height]).drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
  }
  onProgress({ phase: "saving" });
  return out.save({ useObjectStreams: true });
}

export type PageChoice = "current" | "specify" | "odd" | "even";

/**
 * The zero-based pages a "Mark pages" choice covers. `current` is zero-based; `spec` is what the person typed
 * for "specify", like "1-3, 5", counted from 1.
 */
export function chosenPages(choice: PageChoice, current: number, spec: string, pageCount: number): { ok: true; pages: number[] } | { ok: false; error: string } {
  const all = Array.from({ length: pageCount }, (_, i) => i);
  if (choice === "current") return { ok: true, pages: [current] };
  // Odd and even as a reader counts, from page 1.
  if (choice === "odd") return { ok: true, pages: all.filter((i) => i % 2 === 0) };
  if (choice === "even") return pageCount > 1 ? { ok: true, pages: all.filter((i) => i % 2 === 1) } : { ok: false, error: "This PDF has no even pages." };
  if (!spec.trim()) return { ok: false, error: "Enter the pages to black out, like 1-3, 5." };
  const parsed = parsePageRanges(spec, pageCount);
  return parsed.ok ? { ok: true, pages: [...new Set(parsed.ranges.flatMap(rangeIndexes))].sort((a, b) => a - b) } : parsed;
}

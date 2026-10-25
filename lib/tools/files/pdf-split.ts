import { PDFDocument } from "pdf-lib";

/** A run of pages, numbered from 1 as a reader counts them. `from` > `to` means backwards. */
export interface PageRange {
  from: number;
  to: number;
}

export type ParsedRanges = { ok: true; ranges: PageRange[] } | { ok: false; error: string };

/**
 * Reads page selections like "1-3, 5, 8-" against a PDF of `pageCount` pages. "8-" runs to the last
 * page, "-3" starts at the first, "5-3" runs backwards. Pages can repeat.
 */
export function parsePageRanges(input: string, pageCount: number): ParsedRanges {
  // "2 - 4" means 2-4, so spaces around a dash don't split it.
  const parts = input.replace(/\s*[-–]\s*/g, "-").split(/[,;\s]+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "Enter the pages to extract, like 1-3, 5." };
  const ranges: PageRange[] = [];
  for (const part of parts) {
    const match = /^(\d*)-(\d*)$/.exec(part) ?? /^(\d+)$/.exec(part);
    if (!match || (match[1] === "" && match[2] === "")) return { ok: false, error: `"${part}" isn't a page or a range like 2-5.` };
    const from = match[1] === "" ? 1 : Number(match[1]);
    const to = match.length === 2 ? from : match[2] === "" ? pageCount : Number(match[2]);
    for (const page of [from, to]) {
      if (page < 1 || page > pageCount) {
        return { ok: false, error: `There's no page ${page}: this PDF has ${pageCount === 1 ? "1 page" : `${pageCount} pages`}.` };
      }
    }
    ranges.push({ from, to });
  }
  return { ok: true, ranges };
}

/** Zero-based page indexes of a range, in its order. */
export function rangeIndexes({ from, to }: PageRange): number[] {
  const step = from <= to ? 1 : -1;
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from - 1 + i * step);
}

/** "1-3", "5", for file names and labels. */
export const rangeLabel = ({ from, to }: PageRange) => (from === to ? String(from) : `${from}-${to}`);

export type SplitProgress = { phase: "reading" } | { phase: "writing"; done: number; total: number };

/**
 * Builds one new PDF per group of zero-based page indexes, copying those pages from `input`.
 * Throws on encrypted or broken files.
 */
export async function extractPages(input: Uint8Array, groups: number[][], onProgress: (progress: SplitProgress) => void = () => {}): Promise<Uint8Array[]> {
  onProgress({ phase: "reading" });
  const source = await PDFDocument.load(input, { updateMetadata: false });
  const outputs: Uint8Array[] = [];
  for (const [i, indexes] of groups.entries()) {
    onProgress({ phase: "writing", done: i, total: groups.length });
    const doc = await PDFDocument.create();
    for (const page of await doc.copyPages(source, indexes)) doc.addPage(page);
    outputs.push(await doc.save({ useObjectStreams: true }));
  }
  return outputs;
}

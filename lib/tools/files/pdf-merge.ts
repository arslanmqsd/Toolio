import { PDFDocument } from "pdf-lib";

export type MergeProgress = { phase: "adding"; done: number; total: number } | { phase: "saving" };

/** Number of pages, which also checks the file opens. Throws on encrypted or broken files. */
export async function countPages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
}

/**
 * One PDF with every page of `files`, in order. Pages keep their content, size and rotation; bookmarks
 * and fillable form fields from the originals aren't carried over. Throws on encrypted or broken files.
 */
export async function mergePdfs(files: Uint8Array[], onProgress: (progress: MergeProgress) => void = () => {}): Promise<Uint8Array> {
  if (files.length === 0) throw new Error("No PDFs to merge.");
  const merged = await PDFDocument.create();
  for (const [i, bytes] of files.entries()) {
    onProgress({ phase: "adding", done: i, total: files.length });
    const source = await PDFDocument.load(bytes, { updateMetadata: false });
    for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page);
  }
  onProgress({ phase: "saving" });
  return merged.save({ useObjectStreams: true });
}

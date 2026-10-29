/** Test helpers for tools that draw on PDF pages. */
import { PDFArray, PDFDocument, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";

/** Every page's drawing commands, decoded to text. */
export async function pageContents(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return refs
      .map((ref) => doc.context.lookup(ref as PDFRef))
      .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
      .map((s) => new TextDecoder().decode(decodePDFRawStream(s).decode()))
      .join("\n");
  });
}

/** The text matrices ("a b c d e f Tm") a page's content sets, one per drawn text. */
export function textMatrices(content: string): number[][] {
  return [...content.matchAll(/((?:-?[\d.e-]+ ){6})Tm/g)].map((m) => m[1].trim().split(" ").map(Number));
}

/** The strings a page's content shows, decoded from pdf-lib's hex form. */
export function shownText(content: string): string[] {
  return [...content.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((m) => m[1].match(/../g)?.map((h) => String.fromCharCode(parseInt(h, 16))).join("") ?? "");
}

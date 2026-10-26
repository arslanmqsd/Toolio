/** Plain-English reason a PDF couldn't be processed, from the error pdf-lib or the worker gave. */
export function pdfErrorMessage(message: string): string {
  if (/encrypt|password/i.test(message)) return "This PDF is password-protected. Remove the password first, then try again.";
  if (message === "out of memory") return "The browser ran out of memory on this file. Try a smaller PDF.";
  return "This file couldn't be read as a PDF. It may be damaged or not a PDF at all.";
}

/** The input, decoded parts and the new file are all in memory at once; past this, tabs (phones first) run out. */
export const PDF_MAX_BYTES = 100 * 1024 * 1024;

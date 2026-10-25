/** Plain-English reason a PDF couldn't be processed, from the error pdf-lib or the worker gave. */
export function pdfErrorMessage(message: string): string {
  if (/encrypt/i.test(message)) return "This PDF is password-protected. Remove the password first, then try again.";
  if (message === "out of memory") return "The browser ran out of memory on this file. Try a smaller PDF.";
  return "This file couldn't be read as a PDF. It may be damaged or not a PDF at all.";
}

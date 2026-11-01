/**
 * Making scanned PDFs searchable: Tesseract reads each page's picture and writes its words as a text-only
 * PDF page (invisible text, placed where each word sits). That page is laid over the original, which stays
 * exactly as it was, so the file looks the same but its text can be selected, copied and searched.
 */

import { PDFDocument, degrees } from "pdf-lib";
import { seenToUser } from "./pdf-page-numbers";

/** One page's OCR text, as the one-page text-only PDF Tesseract makes from the page as seen. */
export interface TextLayer {
  /** Zero-based page. */
  page: number;
  pdf: Uint8Array;
}

/** Resolution pages are read at: Tesseract is most accurate at about 300 DPI. */
export const OCR_DPI = 300;

/** The PDF with each layer stretched over its page as seen (rotation and crop applied). Other pages are unchanged. */
export async function addTextLayers(input: Uint8Array, layers: TextLayer[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  for (const { page: index, pdf } of layers) {
    const [layer] = await doc.embedPdf(pdf, [0]);
    const page = doc.getPage(index);
    const box = page.getCropBox();
    const rotation = page.getRotation().angle;
    const [width, height] = rotation % 180 ? [box.height, box.width] : [box.width, box.height];
    const [x, y] = seenToUser(box, rotation, [0, 0]);
    page.drawPage(layer, { x, y, width, height, rotate: degrees(rotation) });
  }
  return doc.save({ useObjectStreams: true });
}

/** Languages offered, by Tesseract code. Most used first; the list stays short so the menu is quick to scan. */
export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: "eng", label: "English" },
  { code: "spa", label: "Spanish" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "por", label: "Portuguese" },
  { code: "ita", label: "Italian" },
  { code: "nld", label: "Dutch" },
  { code: "pol", label: "Polish" },
  { code: "tur", label: "Turkish" },
  { code: "rus", label: "Russian" },
  { code: "ukr", label: "Ukrainian" },
  { code: "ara", label: "Arabic" },
  { code: "urd", label: "Urdu" },
  { code: "hin", label: "Hindi" },
  { code: "ben", label: "Bengali" },
  { code: "ind", label: "Indonesian" },
  { code: "vie", label: "Vietnamese" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "chi_tra", label: "Chinese (Traditional)" },
  { code: "jpn", label: "Japanese" },
  { code: "kor", label: "Korean" },
];

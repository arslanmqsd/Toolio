"use client";

import PdfEditor from "./PdfEditor";

/** Redact PDF: the PDF editor with just its Redact tab. */
export default function RedactPdf() {
  return <PdfEditor tabs={["redact"]} suffix="redacted" />;
}

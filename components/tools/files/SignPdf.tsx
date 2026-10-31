"use client";

import PdfEditor from "./PdfEditor";

/** Sign PDF: the PDF editor with just its Sign tab. */
export default function SignPdf() {
  return <PdfEditor tabs={["sign"]} suffix="signed" />;
}

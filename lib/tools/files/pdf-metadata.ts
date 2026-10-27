import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";

export const TEXT_FIELDS = ["title", "author", "subject", "keywords", "creator", "producer"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

/** The document info a PDF reader shows under Properties. Empty text or a null date means "not set". */
export type PdfMetadata = Record<TextField, string> & {
  /** ISO 8601, or null. */
  created: string | null;
  modified: string | null;
};

export interface ReadMetadata {
  metadata: PdfMetadata;
  /** Whether the file also has an XMP block, a second copy of these details that some readers prefer. */
  hasXmp: boolean;
}

/** Keys in the PDF's info dictionary. */
const KEYS: Record<TextField | "created" | "modified", string> = {
  title: "Title",
  author: "Author",
  subject: "Subject",
  keywords: "Keywords",
  creator: "Creator",
  producer: "Producer",
  created: "CreationDate",
  modified: "ModDate",
};

export const EMPTY_METADATA: PdfMetadata = { title: "", author: "", subject: "", keywords: "", creator: "", producer: "", created: null, modified: null };

const load = (input: Uint8Array) => PDFDocument.load(input, { updateMetadata: false });

/** A date the file holds, or null when it's missing or written in a form pdf-lib can't read. */
function safeDate(read: () => Date | undefined): string | null {
  try {
    const date = read();
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}

export async function readMetadata(input: Uint8Array): Promise<ReadMetadata> {
  const doc = await load(input);
  return {
    metadata: {
      title: doc.getTitle() ?? "",
      author: doc.getAuthor() ?? "",
      subject: doc.getSubject() ?? "",
      keywords: doc.getKeywords() ?? "",
      creator: doc.getCreator() ?? "",
      producer: doc.getProducer() ?? "",
      created: safeDate(() => doc.getCreationDate()),
      modified: safeDate(() => doc.getModificationDate()),
    },
    hasXmp: doc.catalog.has(PDFName.of("Metadata")),
  };
}

/**
 * The PDF with its info set to exactly `metadata`: empty fields are removed. The XMP block is removed too,
 * because readers like Acrobat show it in preference to the info and it would still hold the old values.
 */
export async function writeMetadata(input: Uint8Array, metadata: PdfMetadata): Promise<Uint8Array> {
  const doc = await load(input);
  const { context } = doc;
  let info = context.lookup(context.trailerInfo.Info);
  if (!(info instanceof PDFDict)) {
    info = context.obj({});
    context.trailerInfo.Info = context.register(info);
  }
  const dict = info as PDFDict;

  for (const field of TEXT_FIELDS) {
    const key = PDFName.of(KEYS[field]);
    const value = metadata[field].trim();
    // Hex text is stored as UTF-16, so any language survives.
    if (value) dict.set(key, PDFHexString.fromText(value));
    else dict.delete(key);
  }
  for (const field of ["created", "modified"] as const) {
    const key = PDFName.of(KEYS[field]);
    const value = metadata[field];
    const date = value ? new Date(value) : null;
    if (date && !Number.isNaN(date.getTime())) dict.set(key, PDFString.fromDate(date));
    else dict.delete(key);
  }

  doc.catalog.delete(PDFName.of("Metadata"));
  return doc.save({ useObjectStreams: true });
}

/** "2024-03-05T14:07", the local-time form a datetime-local input takes. */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The ISO time a datetime-local value means in this time zone, or null when it's empty or invalid. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The fields that differ between two versions, for "changed" labels. */
export function changedFields(before: PdfMetadata, after: PdfMetadata): (keyof PdfMetadata)[] {
  return (Object.keys(EMPTY_METADATA) as (keyof PdfMetadata)[]).filter((key) =>
    key === "created" || key === "modified" ? toDateTimeLocal(before[key]) !== toDateTimeLocal(after[key]) : before[key].trim() !== after[key].trim(),
  );
}

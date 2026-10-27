import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { EMPTY_METADATA, changedFields, fromDateTimeLocal, readMetadata, toDateTimeLocal, writeMetadata, type PdfMetadata } from "./pdf-metadata";

const CREATED = new Date("2021-06-01T08:30:00Z");

async function samplePdf({ xmp = false } = {}) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.addPage();
  doc.setTitle("Quarterly report");
  doc.setAuthor("Sam Lee");
  doc.setSubject("Finance");
  doc.setKeywords(["q2", "revenue"]);
  doc.setCreator("Writer");
  doc.setProducer("Exporter 1.0");
  doc.setCreationDate(CREATED);
  if (xmp) doc.catalog.set(PDFName.of("Metadata"), doc.context.register(doc.context.flateStream("<x:xmpmeta/>", { Type: "Metadata", Subtype: "XML" })));
  return doc.save();
}

const FULL: PdfMetadata = {
  title: "Quarterly report",
  author: "Sam Lee",
  subject: "Finance",
  keywords: "q2 revenue",
  creator: "Writer",
  producer: "Exporter 1.0",
  created: CREATED.toISOString(),
  modified: null,
};

describe("readMetadata", () => {
  it("reads every field", async () => {
    expect(await readMetadata(await samplePdf())).toEqual({ metadata: FULL, hasXmp: false });
  });

  it("notices an XMP block", async () => {
    expect((await readMetadata(await samplePdf({ xmp: true }))).hasXmp).toBe(true);
  });

  it("gives empty fields for a file with no info", async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage();
    expect((await readMetadata(await doc.save())).metadata).toEqual(EMPTY_METADATA);
  });

  it("refuses files that aren't PDFs", async () => {
    await expect(readMetadata(new TextEncoder().encode("nope"))).rejects.toThrow();
  });
});

describe("writeMetadata", () => {
  it("changes fields and keeps the rest", async () => {
    const out = await writeMetadata(await samplePdf(), { ...FULL, title: "Annual report", keywords: "q4, revenue, 2021" });
    expect((await readMetadata(out)).metadata).toEqual({ ...FULL, title: "Annual report", keywords: "q4, revenue, 2021" });
  });

  it("removes fields left empty", async () => {
    const out = await writeMetadata(await samplePdf(), { ...FULL, author: "  ", producer: "", created: null });
    const { metadata } = await readMetadata(out);
    expect([metadata.author, metadata.producer, metadata.created]).toEqual(["", "", null]);
    const { context } = await PDFDocument.load(out, { updateMetadata: false });
    expect(String(context.lookup(context.trailerInfo.Info))).not.toMatch(/Author|Producer|CreationDate/);
  });

  it("clears everything", async () => {
    expect((await readMetadata(await writeMetadata(await samplePdf(), EMPTY_METADATA))).metadata).toEqual(EMPTY_METADATA);
  });

  it("keeps text in any language", async () => {
    const out = await writeMetadata(await samplePdf(), { ...FULL, title: "Rapport — été 2024 · 報告書 · تقرير" });
    expect((await readMetadata(out)).metadata.title).toBe("Rapport — été 2024 · 報告書 · تقرير");
  });

  it("writes dates to the second", async () => {
    const modified = "2024-02-29T23:59:58.000Z";
    expect((await readMetadata(await writeMetadata(await samplePdf(), { ...FULL, modified }))).metadata.modified).toBe(modified);
  });

  it("removes the XMP block so it can't contradict the new values", async () => {
    const out = await writeMetadata(await samplePdf({ xmp: true }), FULL);
    expect((await readMetadata(out)).hasXmp).toBe(false);
  });

  it("adds info to a file that had none", async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage();
    expect((await readMetadata(await writeMetadata(await doc.save(), { ...EMPTY_METADATA, title: "New" }))).metadata.title).toBe("New");
  });
});

describe("datetime-local helpers", () => {
  it("round-trips a local time", () => {
    const iso = new Date(2024, 2, 5, 14, 7).toISOString();
    expect(toDateTimeLocal(iso)).toBe("2024-03-05T14:07");
    expect(fromDateTimeLocal("2024-03-05T14:07")).toBe(iso);
  });

  it("treats empty and invalid values as no date", () => {
    expect(toDateTimeLocal(null)).toBe("");
    expect(toDateTimeLocal("garbage")).toBe("");
    expect(fromDateTimeLocal("")).toBeNull();
    expect(fromDateTimeLocal("not a date")).toBeNull();
  });
});

describe("changedFields", () => {
  it("lists only what differs", () => {
    expect(changedFields(FULL, FULL)).toEqual([]);
    expect(changedFields(FULL, { ...FULL, title: "x", modified: new Date().toISOString() })).toEqual(["title", "modified"]);
  });

  it("ignores surrounding spaces and seconds the date input can't show", () => {
    expect(changedFields(FULL, { ...FULL, author: " Sam Lee ", created: "2021-06-01T08:30:45.000Z" })).toEqual([]);
  });
});

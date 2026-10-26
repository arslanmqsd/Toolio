"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileArchive, Image as ImageIcon } from "lucide-react";
import { DownloadButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import TextInput from "@/components/ui/TextInput";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { saveFile } from "@/lib/save-file";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import { openPdfRenderer, type PdfRenderer } from "@/lib/tools/files/pdf-render";
import { parsePageRanges, rangeIndexes } from "@/lib/tools/files/pdf-split";
import { imageName, type ImageFormat } from "@/lib/tools/files/pdf-to-image";
import { zipStore } from "@/lib/zip";

const FORMATS: { id: ImageFormat; label: string }[] = [
  { id: "png", label: "PNG" },
  { id: "jpg", label: "JPG" },
];

const FORMAT_HELP: Record<ImageFormat, string> = {
  png: "Sharp text and lines, bigger files.",
  jpg: "Smaller files, best for scans and photos.",
};

const RESOLUTIONS = [
  { id: "72", label: "72 DPI" },
  { id: "150", label: "150 DPI" },
  { id: "300", label: "300 DPI" },
] as const;

type Resolution = (typeof RESOLUTIONS)[number]["id"];

const RESOLUTION_HELP: Record<Resolution, string> = {
  "72": "Screen size: a letter page is 612 × 792 pixels.",
  "150": "Good for reading on screen and zooming in.",
  "300": "Print quality. Large files, and slower on long PDFs.",
};

const MIME: Record<ImageFormat, string> = { png: "image/png", jpg: "image/jpeg" };

type Doc = { status: "none" } | { status: "opening" } | { status: "ready"; pages: number } | { status: "error"; error: string };

interface Output {
  name: string;
  page: number;
  bytes: Uint8Array<ArrayBuffer>;
  url: string;
}

type Job = { status: "idle" } | { status: "working"; done: number; total: number } | { status: "done"; outputs: Output[] } | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

export default function PdfToImage() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc>({ status: "none" });
  const [format, setFormat] = useState<ImageFormat>("png");
  const [resolution, setResolution] = useState<Resolution>("150");
  const [pagesText, setPagesText] = useState("");
  const [job, setJob] = useState<Job>({ status: "idle" });
  const renderer = useRef<PdfRenderer | null>(null);
  /** Bumped to stop a running conversion: each run checks it still owns the latest number. */
  const run = useRef(0);

  // pdf.js opens the file once, counting pages and catching damaged or locked files; Convert reuses it.
  useEffect(() => {
    if (!file) return setDoc({ status: "none" });
    if (file.size > PDF_MAX_BYTES) return setDoc({ status: "error", error: `This file is over ${formatBytes(PDF_MAX_BYTES)}, too big to process in the browser.` });
    let cancelled = false;
    let opened: PdfRenderer | null = null;
    setDoc({ status: "opening" });
    file
      .arrayBuffer()
      .then((buffer) => (cancelled ? null : openPdfRenderer(new Uint8Array(buffer))))
      .then((r) => {
        if (!r) return;
        if (cancelled) return r.destroy();
        opened = renderer.current = r;
        setDoc({ status: "ready", pages: r.pageCount });
      })
      .catch((err: Error) => !cancelled && setDoc({ status: "error", error: pdfErrorMessage(err.message) }));
    return () => {
      cancelled = true;
      opened?.destroy();
      renderer.current = null;
    };
  }, [file]);

  // New settings make an earlier result out of date.
  useEffect(() => {
    run.current++;
    setJob({ status: "idle" });
  }, [file, format, resolution, pagesText]);

  // Preview URLs live as long as their result.
  useEffect(() => {
    if (job.status !== "done") return;
    return () => job.outputs.forEach((o) => URL.revokeObjectURL(o.url));
  }, [job]);

  useEffect(() => () => void run.current++, []);

  const blank = !pagesText.trim();
  const parsed = useMemo(() => (doc.status === "ready" && !blank ? parsePageRanges(pagesText, doc.pages) : null), [doc, pagesText, blank]);
  // Blank means every page; a page listed twice is drawn once.
  const indexes = useMemo(() => {
    if (doc.status !== "ready") return null;
    if (blank) return Array.from({ length: doc.pages }, (_, i) => i);
    return parsed?.ok ? [...new Set(parsed.ranges.flatMap(rangeIndexes))] : null;
  }, [doc, blank, parsed]);
  const pagesError = parsed && !parsed.ok ? parsed.error : null;

  async function start() {
    const r = renderer.current;
    if (!file || !r || !indexes || doc.status !== "ready") return;
    const id = ++run.current;
    const outputs: Output[] = [];
    const dpi = Number(resolution);
    setJob({ status: "working", done: 0, total: indexes.length });
    try {
      // shortcut: keeps every image in memory until download; stream into the ZIP if 300 DPI on long PDFs runs tabs out of memory.
      for (const [n, index] of indexes.entries()) {
        const blob = await r.image(index, dpi, format);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (run.current !== id) return outputs.forEach((o) => URL.revokeObjectURL(o.url));
        outputs.push({ name: imageName(file.name, index + 1, doc.pages, format), page: index + 1, bytes, url: URL.createObjectURL(blob) });
        setJob({ status: "working", done: n + 1, total: indexes.length });
      }
      setJob({ status: "done", outputs });
    } catch (err) {
      outputs.forEach((o) => URL.revokeObjectURL(o.url));
      if (run.current === id) setJob({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  function downloadZip(outputs: Output[]) {
    const name = `${file?.name.replace(/\.pdf$/i, "") || "pages"}-${format}.zip`;
    saveFile(zipStore(outputs.map((o) => ({ name: o.name, data: o.bytes }))), name, "application/zip");
  }

  const single = job.status === "done" && job.outputs.length === 1 ? job.outputs[0] : null;

  return (
    <>
      <InputPanel label="PDF">
        <div className="space-y-5">
          {file ? (
            <SelectedFile
              file={file}
              onClear={() => setFile(null)}
              detail={doc.status === "ready" ? plural(doc.pages, "page", "pages") : doc.status === "opening" ? "opening…" : undefined}
            />
          ) : (
            <FileDrop onFiles={([f]) => setFile(f)} accept="application/pdf,.pdf" what="a PDF" />
          )}

          {doc.status === "error" && <Alert title="Couldn't open this PDF">{doc.error}</Alert>}

          <Field label="Format" help={FORMAT_HELP[format]}>
            <SegmentedControl label="Format" options={FORMATS} value={format} onChange={setFormat} />
          </Field>

          <Field label="Resolution" help={RESOLUTION_HELP[resolution]}>
            <SegmentedControl label="Resolution" options={RESOLUTIONS} value={resolution} onChange={setResolution} />
          </Field>

          <Field
            label="Pages"
            htmlFor="pdf-image-pages"
            help={
              pagesError ? (
                <span id="pdf-image-pages-error" className="text-[color:var(--error)]">
                  {pagesError}
                </span>
              ) : indexes && !blank ? (
                `${plural(indexes.length, "page", "pages")} selected.`
              ) : (
                "Leave blank for every page, or pick some, like 1-3, 5."
              )
            }
          >
            <TextInput
              id="pdf-image-pages"
              value={pagesText}
              onChange={(e) => setPagesText(e.target.value)}
              placeholder="All pages"
              disabled={doc.status !== "ready"}
              aria-invalid={Boolean(pagesError)}
              aria-describedby={pagesError ? "pdf-image-pages-error" : undefined}
              autoComplete="off"
              inputMode="numeric"
            />
          </Field>

          <Button variant="primary" icon={ImageIcon} onClick={start} disabled={!indexes || job.status === "working"}>
            Convert to {format.toUpperCase()}
          </Button>
        </div>
      </InputPanel>

      <OutputPanel
        label={job.status === "done" && job.outputs.length > 1 ? "Images" : "Image"}
        copyable={false}
        download={single ? { filename: single.name, mimeType: MIME[format], content: single.bytes } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className={muted}>{file ? "Pick a format, then convert." : "Choose a PDF to turn its pages into images."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label={`Drawing page ${Math.min(job.done + 1, job.total)} of ${job.total}…`}
              value={job.done / job.total}
              onCancel={() => {
                run.current++;
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't convert this PDF">{job.error}</Alert>
          ) : (
            <div className="space-y-4 font-[family-name:var(--font-ui)]">
              {job.outputs.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm">
                    <span className="font-semibold">{plural(job.outputs.length, "image", "images")}</span>
                    <span className="text-[color:var(--text-muted)]"> · {formatBytes(job.outputs.reduce((sum, o) => sum + o.bytes.length, 0))}</span>
                  </p>
                  <Button icon={FileArchive} onClick={() => downloadZip(job.outputs)}>
                    Download all (ZIP)
                  </Button>
                </div>
              )}
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                {job.outputs.map((out) => (
                  <li key={out.page} className="flex flex-col gap-2 rounded-md border border-[color:var(--border)] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL; next/image can't optimise it */}
                    <img src={out.url} alt={`Page ${out.page}`} className="aspect-square w-full rounded bg-[color:var(--surface)] object-contain" />
                    <span className="min-w-0 break-all text-xs">
                      {out.name}
                      <span className="block text-[color:var(--text-muted)]">{formatBytes(out.bytes.length)}</span>
                    </span>
                    {!single && <DownloadButton content={out.bytes} filename={out.name} mimeType={MIME[format]} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

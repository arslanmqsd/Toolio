"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import TextInput from "@/components/ui/TextInput";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import { openPdfRenderer, type PdfRenderer } from "@/lib/tools/files/pdf-render";
import { parsePageRanges, rangeIndexes } from "@/lib/tools/files/pdf-split";
import { joinPages } from "@/lib/tools/files/pdf-text";

/** Past this, the panel shows a cut-off preview: rendering megabytes of text in one block stalls the page. */
const PREVIEW_CHARS = 100_000;

type Doc = { status: "none" } | { status: "opening" } | { status: "ready"; pages: number } | { status: "error"; error: string };

type Job =
  | { status: "idle" }
  | { status: "working"; done: number; total: number }
  | { status: "done"; pages: { page: number; text: string }[] }
  | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

export default function PdfToText() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc>({ status: "none" });
  const [pagesText, setPagesText] = useState("");
  const [markPages, setMarkPages] = useState(false);
  const [job, setJob] = useState<Job>({ status: "idle" });
  const renderer = useRef<PdfRenderer | null>(null);
  /** Bumped to stop a running extraction; each run checks it still owns the latest number. */
  const run = useRef(0);

  // pdf.js opens the file once, counting pages and catching damaged or locked files; Extract reuses it.
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

  // A new file or page list makes an earlier result out of date; page markers only change how it's joined.
  useEffect(() => {
    run.current++;
    setJob({ status: "idle" });
  }, [file, pagesText]);

  useEffect(() => () => void run.current++, []);

  const blank = !pagesText.trim();
  const parsed = useMemo(() => (doc.status === "ready" && !blank ? parsePageRanges(pagesText, doc.pages) : null), [doc, pagesText, blank]);
  // Blank means every page; a page listed twice is read once.
  const indexes = useMemo(() => {
    if (doc.status !== "ready") return null;
    if (blank) return Array.from({ length: doc.pages }, (_, i) => i);
    return parsed?.ok ? [...new Set(parsed.ranges.flatMap(rangeIndexes))] : null;
  }, [doc, blank, parsed]);
  const pagesError = parsed && !parsed.ok ? parsed.error : null;

  async function start() {
    const r = renderer.current;
    if (!r || !indexes) return;
    const id = ++run.current;
    const pages: { page: number; text: string }[] = [];
    setJob({ status: "working", done: 0, total: indexes.length });
    try {
      for (const [n, index] of indexes.entries()) {
        const text = await r.text(index);
        if (run.current !== id) return;
        pages.push({ page: index + 1, text });
        setJob({ status: "working", done: n + 1, total: indexes.length });
      }
      setJob({ status: "done", pages });
    } catch (err) {
      if (run.current === id) setJob({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  const output = job.status === "done" ? joinPages(job.pages, markPages) : "";
  const empty = job.status === "done" ? job.pages.filter((p) => !p.text).length : 0;
  const noText = job.status === "done" && empty === job.pages.length;
  const outName = file ? file.name.replace(/(\.pdf)?$/i, ".txt") : "text.txt";

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

          <Field
            label="Pages"
            htmlFor="pdf-text-pages"
            help={
              pagesError ? (
                <span id="pdf-text-pages-error" className="text-[color:var(--error)]">
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
              id="pdf-text-pages"
              value={pagesText}
              onChange={(e) => setPagesText(e.target.value)}
              placeholder="All pages"
              disabled={doc.status !== "ready"}
              aria-invalid={Boolean(pagesError)}
              aria-describedby={pagesError ? "pdf-text-pages-error" : undefined}
              autoComplete="off"
              inputMode="numeric"
            />
          </Field>

          <Checkbox checked={markPages} onChange={setMarkPages}>
            Mark where each page starts (--- Page 3 ---)
          </Checkbox>

          <Button variant="primary" icon={FileText} onClick={start} disabled={!indexes || job.status === "working"}>
            Extract text
          </Button>
        </div>
      </InputPanel>

      <OutputPanel
        label="Text"
        copyText={output || undefined}
        outputType="text"
        download={output ? { filename: outName, mimeType: "text/plain" } : undefined}
      >
        <div aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className={muted}>{file ? "Choose pages if you like, then extract." : "Choose a PDF to pull its text out."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label={`Reading page ${Math.min(job.done + 1, job.total)} of ${job.total}…`}
              value={job.done / job.total}
              onCancel={() => {
                run.current++;
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't read the text">{job.error}</Alert>
          ) : noText ? (
            <Alert title="No text found" tone="warn">
              These pages have no text to copy. They&apos;re probably scanned images, which need OCR to read.
            </Alert>
          ) : (
            <>
              <pre className="whitespace-pre-wrap break-words">{output.length > PREVIEW_CHARS ? output.slice(0, PREVIEW_CHARS) + "…" : output}</pre>
              <p role="status" className="mt-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                {plural(output.length, "character", "characters")} from {plural(job.pages.length, "page", "pages")}.
                {empty > 0 && ` ${plural(empty, "page has", "pages have")} no text, maybe scanned.`}
                {output.length > PREVIEW_CHARS && ` Showing the first ${PREVIEW_CHARS.toLocaleString("en-US")}; Copy and Download include everything.`}
              </p>
            </>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

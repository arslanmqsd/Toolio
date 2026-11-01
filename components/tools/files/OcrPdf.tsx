"use client";

import { useEffect, useRef, useState } from "react";
import { ScanText } from "lucide-react";
import type { Worker as Tesseract } from "tesseract.js";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import Select from "@/components/ui/Select";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { saveFile } from "@/lib/save-file";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import { OCR_DPI, OCR_LANGUAGES, type TextLayer } from "@/lib/tools/files/pdf-ocr";
import type { PdfOcrRequest } from "@/lib/tools/files/pdf-ocr.worker";
import { openPdfRenderer, type PdfRenderer } from "@/lib/tools/files/pdf-render";
import { joinPages } from "@/lib/tools/files/pdf-text";
import { exportScale } from "@/lib/tools/files/pdf-to-image";
import { runWorkerTask } from "@/lib/worker-task";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-ocr.worker.ts", import.meta.url));
}

/** Past this, the panel shows a cut-off preview: rendering megabytes of text in one block stalls the page. */
const PREVIEW_CHARS = 100_000;

type Doc = { status: "none" } | { status: "opening" } | { status: "ready"; pages: number } | { status: "error"; error: string };

type Job =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "reading"; page: number; done: number; total: number; progress: number }
  | { status: "saving" }
  | { status: "done"; bytes: Uint8Array | null; pages: { page: number; text: string }[]; hadText: number; blank: number }
  | { status: "error"; error: string };

export default function OcrPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc>({ status: "none" });
  const [language, setLanguage] = useState("eng");
  const [job, setJob] = useState<Job>({ status: "idle" });
  const renderer = useRef<PdfRenderer | null>(null);
  const ocr = useRef<Tesseract | null>(null);
  /** Bumped to stop a running job; each run checks it still owns the latest number. */
  const run = useRef(0);
  const cancelMerge = useRef(() => {});

  // pdf.js opens the file once, counting pages and catching damaged or locked files; OCR reuses it.
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

  function stop() {
    run.current++;
    cancelMerge.current();
    void ocr.current?.terminate();
    ocr.current = null;
  }

  // A new file or language makes an earlier result out of date.
  useEffect(() => {
    stop();
    setJob({ status: "idle" });
  }, [file, language]);

  useEffect(() => stop, []);

  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-searchable.pdf") : "searchable.pdf";
  const busy = job.status === "loading" || job.status === "reading" || job.status === "saving";

  async function start() {
    const r = renderer.current;
    if (!file || !r) return;
    stop();
    const id = ++run.current;
    const live = () => run.current === id;
    setJob({ status: "loading" });
    try {
      // Pages that already have text are left as they are: reading them again would put the words in twice.
      const todo: number[] = [];
      for (let i = 0; i < r.pageCount; i++) if (!(await r.text(i)).trim()) todo.push(i);
      if (!live()) return;
      const hadText = r.pageCount - todo.length;
      if (!todo.length) return setJob({ status: "done", bytes: null, pages: [], hadText, blank: 0 });

      // The engine and language data (a few MB) download on first use, then the browser caches them.
      const { createWorker: createOcr } = await import("tesseract.js");
      let current = { page: todo[0], done: 0 };
      const worker = await createOcr(language, undefined, {
        logger: (m) => m.status === "recognizing text" && live() && setJob({ status: "reading", ...current, total: todo.length, progress: m.progress }),
      });
      if (!live()) return void worker.terminate();
      ocr.current = worker;

      const layers: TextLayer[] = [];
      const pages: { page: number; text: string }[] = [];
      for (const [done, index] of todo.entries()) {
        current = { page: index, done };
        setJob({ status: "reading", ...current, total: todo.length, progress: 0 });
        const { width, height } = await r.size(index);
        const image = await r.image(index, OCR_DPI, "png");
        if (!live()) return;
        // Telling Tesseract the real resolution lets it judge letter sizes; pictures don't carry it.
        await worker.setParameters({ user_defined_dpi: String(Math.round(exportScale(width, height, OCR_DPI) * 72)) });
        const { data } = await worker.recognize(image, { pdfTextOnly: true }, { pdf: true, text: true });
        if (!live()) return;
        const text = data.text.trim();
        pages.push({ page: index + 1, text });
        if (text && data.pdf) layers.push({ page: index, pdf: new Uint8Array(data.pdf) });
      }
      void worker.terminate();
      ocr.current = null;

      const blank = todo.length - layers.length;
      if (!layers.length) return setJob({ status: "done", bytes: null, pages, hadText, blank });
      setJob({ status: "saving" });
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfOcrRequest, never, Uint8Array>(createWorker, { bytes, layers }, { transfer: [bytes, ...layers.map((l) => l.pdf.buffer as ArrayBuffer)] });
      cancelMerge.current = task.cancel;
      const result = await task.result;
      if (!live()) return;
      setJob({ status: "done", bytes: result, pages, hadText, blank });
      saveFile(result as Uint8Array<ArrayBuffer>, outName, "application/pdf");
    } catch (err) {
      if (!live()) return;
      const message = String((err as Error)?.message ?? err);
      if (message === "cancelled") return;
      stop();
      // Tesseract fails with fetch or network errors when the language data can't be downloaded.
      setJob({
        status: "error",
        error: /fetch|network|traineddata|load/i.test(message) ? "Couldn't download the text recognition files. Check your connection and try again." : pdfErrorMessage(message),
      });
    }
  }

  const text = job.status === "done" ? joinPages(job.pages, true) : "";

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
            <FileDrop onFiles={([f]) => setFile(f)} accept="application/pdf,.pdf" what="a scanned PDF" />
          )}

          {doc.status === "error" && <Alert title="Couldn't open this PDF">{doc.error}</Alert>}

          <Field label="Document language" htmlFor="ocr-language" help="Picking the language the text is written in gives much better results.">
            <Select id="ocr-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {OCR_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>

          <Button variant="primary" icon={ScanText} onClick={start} disabled={doc.status !== "ready" || busy}>
            Make searchable
          </Button>
          <p className="text-xs text-[color:var(--text-muted)]">
            Runs on your device: the PDF is never uploaded. The first run downloads the text recognition engine and language (a few MB). Pages keep their look;
            the recognised text is added invisibly over them.
          </p>
        </div>
      </InputPanel>

      <OutputPanel
        label="Searchable PDF"
        copyText={text || undefined}
        download={job.status === "done" && job.bytes ? { filename: outName, mimeType: "application/pdf", content: job.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div aria-live="polite" aria-busy={busy}>
          {job.status === "idle" ? (
            <p className="text-[color:var(--text-muted)]">{file ? "Pick the language, then press Make searchable." : "Choose a scanned PDF."}</p>
          ) : busy ? (
            <TaskProgress
              label={
                job.status === "loading"
                  ? "Getting ready…"
                  : job.status === "saving"
                    ? "Saving the PDF…"
                    : `Reading page ${job.page + 1} (${job.done + 1} of ${job.total})…`
              }
              value={job.status === "reading" ? (job.done + job.progress) / job.total : undefined}
              onCancel={() => {
                stop();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't make this PDF searchable">{job.error}</Alert>
          ) : !job.bytes ? (
            <Alert title={job.pages.length ? "No text found" : "Already searchable"} tone="warn">
              {job.pages.length
                ? `No text could be read on ${job.pages.length === 1 ? "the page" : `the ${job.pages.length} pages`} without it. Check the language, or the scan may be too faint or blurry.`
                : "Every page already has text you can select, so there's nothing to add. PDF to Text can pull it out."}
            </Alert>
          ) : (
            <div className="space-y-4">
              <div role="status" className="space-y-1 font-[family-name:var(--font-ui)]">
                <p className="text-base">
                  <span className="font-semibold">Text added to {plural(job.pages.length - job.blank, "page", "pages")}</span>
                  <span className="text-[color:var(--text-muted)]"> · {formatBytes(job.bytes.length)}</span>
                </p>
                <p className="break-all text-sm text-[color:var(--text-muted)]">
                  Downloaded as {outName}.{job.hadText > 0 && ` ${plural(job.hadText, "page", "pages")} already had text and ${job.hadText === 1 ? "was" : "were"} left as is.`}
                  {job.blank > 0 && ` No text found on ${plural(job.blank, "page", "pages")}.`}
                </p>
              </div>
              <details>
                <summary className="cursor-pointer font-[family-name:var(--font-ui)] text-sm font-medium">Check the recognised text</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">
                  {text.length > PREVIEW_CHARS ? text.slice(0, PREVIEW_CHARS) + "…" : text}
                </pre>
              </details>
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

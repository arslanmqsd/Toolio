"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Stamp } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
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
import { PDF_COLOR_OPTIONS, type PdfColor } from "@/lib/tools/files/pdf-colors";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import { openPdfRenderer } from "@/lib/tools/files/pdf-render";
import { parsePageRanges, rangeIndexes } from "@/lib/tools/files/pdf-split";
import {
  unsupportedCharacters,
  type WatermarkLayout,
  type WatermarkOptions,
  type WatermarkProgress,
  type WatermarkSize,
} from "@/lib/tools/files/pdf-watermark";
import type { PdfWatermarkRequest } from "@/lib/tools/files/pdf-watermark.worker";
import { runWorkerTask } from "@/lib/worker-task";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-watermark.worker.ts", import.meta.url));
}

const LAYOUTS: { id: WatermarkLayout; label: string }[] = [
  { id: "center", label: "Once, centred" },
  { id: "tiled", label: "Repeated" },
];

const SIZES: { id: WatermarkSize; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

const OPACITIES = [
  { id: "0.15", label: "Faint" },
  { id: "0.3", label: "Medium" },
  { id: "0.6", label: "Strong" },
] as const;

const ANGLES = [
  { id: "45", label: "Diagonal" },
  { id: "0", label: "Horizontal" },
] as const;

type Doc = { status: "none" } | { status: "opening" } | { status: "ready"; pages: number } | { status: "error"; error: string };

type Job =
  | { status: "idle" }
  | { status: "working"; progress: WatermarkProgress }
  | { status: "done"; bytes: Uint8Array; pages: number; preview: string | null }
  | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

function progressLabel(progress: WatermarkProgress): string {
  if (progress.phase === "reading") return "Reading PDF…";
  if (progress.phase === "saving") return "Saving…";
  return `Stamping page ${progress.done + 1} of ${progress.total}…`;
}

export default function PdfWatermark() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc>({ status: "none" });
  const [text, setText] = useState("CONFIDENTIAL");
  const [layout, setLayout] = useState<WatermarkLayout>("center");
  const [size, setSize] = useState<WatermarkSize>("medium");
  const [opacity, setOpacity] = useState<(typeof OPACITIES)[number]["id"]>("0.3");
  const [angle, setAngle] = useState<(typeof ANGLES)[number]["id"]>("45");
  const [color, setColor] = useState<PdfColor>("gray");
  const [pagesText, setPagesText] = useState("");
  const [job, setJob] = useState<Job>({ status: "idle" });
  const cancelJob = useRef(() => {});
  /** Bumped when a result goes stale, so a preview still drawing for it is dropped. */
  const run = useRef(0);

  // Open the file in the background to count its pages and catch damaged or locked files early.
  useEffect(() => {
    if (!file) return setDoc({ status: "none" });
    if (file.size > PDF_MAX_BYTES) return setDoc({ status: "error", error: `This file is over ${formatBytes(PDF_MAX_BYTES)}, too big to process in the browser.` });
    let cancelled = false;
    let cancelTask = () => {};
    setDoc({ status: "opening" });
    file
      .arrayBuffer()
      .then((bytes) => {
        if (cancelled) return;
        const task = runWorkerTask<PdfWatermarkRequest, never, number>(createWorker, { kind: "count", bytes }, { transfer: [bytes] });
        cancelTask = task.cancel;
        return task.result.then((pages) => setDoc({ status: "ready", pages }));
      })
      .catch((err: Error) => !cancelled && err.message !== "cancelled" && setDoc({ status: "error", error: pdfErrorMessage(err.message) }));
    return () => {
      cancelled = true;
      cancelTask();
    };
  }, [file]);

  // Any change makes an earlier result out of date.
  useEffect(() => {
    run.current++;
    cancelJob.current();
    setJob({ status: "idle" });
  }, [file, text, layout, size, opacity, angle, color, pagesText]);

  useEffect(() => {
    if (job.status !== "done" || !job.preview) return;
    const url = job.preview;
    return () => URL.revokeObjectURL(url);
  }, [job]);

  useEffect(
    () => () => {
      run.current++;
      cancelJob.current();
    },
    [],
  );

  const trimmed = text.trim();
  const badChars = useMemo(() => unsupportedCharacters(trimmed), [trimmed]);
  const textError = !trimmed ? "Enter the text to stamp." : badChars.length ? `The built-in PDF fonts can't draw ${badChars.join(" ")}. Use Western European letters.` : null;

  const blank = !pagesText.trim();
  const parsed = useMemo(() => (doc.status === "ready" && !blank ? parsePageRanges(pagesText, doc.pages) : null), [doc, pagesText, blank]);
  const pages = useMemo(() => (parsed?.ok ? [...new Set(parsed.ranges.flatMap(rangeIndexes))].sort((a, b) => a - b) : undefined), [parsed]);
  const pagesError = parsed && !parsed.ok ? parsed.error : null;
  const ready = doc.status === "ready" && !textError && !pagesError;

  async function start() {
    if (!file || !ready) return;
    const id = ++run.current;
    const options: WatermarkOptions = { text: trimmed, layout, size, opacity: Number(opacity), angle: Number(angle), color };
    setJob({ status: "working", progress: { phase: "reading" } });
    try {
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfWatermarkRequest, WatermarkProgress, Uint8Array>(createWorker, { kind: "watermark", bytes, options, pages }, {
        transfer: [bytes],
        onProgress: (progress) => setJob({ status: "working", progress }),
      });
      cancelJob.current = task.cancel;
      const out = await task.result;
      const stamped = pages?.length ?? doc.pages;
      setJob({ status: "done", bytes: out, pages: stamped, preview: null });
      // A look at the first stamped page. Optional: if pdf.js can't draw it, the result is still there.
      const renderer = await openPdfRenderer(out).catch(() => null);
      const blob = await renderer?.thumbnail(pages?.[0] ?? 0, 320).catch(() => null);
      renderer?.destroy();
      if (blob && run.current === id) setJob({ status: "done", bytes: out, pages: stamped, preview: URL.createObjectURL(blob) });
    } catch (err) {
      if ((err as Error).message !== "cancelled") setJob({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-watermarked.pdf") : "watermarked.pdf";

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
            label="Text"
            htmlFor="watermark-text"
            help={
              textError ? (
                <span id="watermark-text-error" className="text-[color:var(--error)]">
                  {textError}
                </span>
              ) : undefined
            }
          >
            <TextInput
              id="watermark-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={100}
              aria-invalid={Boolean(textError)}
              aria-describedby={textError ? "watermark-text-error" : undefined}
              autoComplete="off"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Placement">
              <SegmentedControl label="Placement" options={LAYOUTS} value={layout} onChange={setLayout} />
            </Field>
            <Field label="Angle">
              <SegmentedControl label="Angle" options={ANGLES} value={angle} onChange={setAngle} />
            </Field>
            <Field label="Size">
              <SegmentedControl label="Size" options={SIZES} value={size} onChange={setSize} />
            </Field>
            <Field label="Opacity">
              <SegmentedControl label="Opacity" options={OPACITIES} value={opacity} onChange={setOpacity} />
            </Field>
          </div>

          <Field label="Color">
            <SegmentedControl label="Color" options={PDF_COLOR_OPTIONS} value={color} onChange={setColor} />
          </Field>

          <Field
            label="Pages"
            htmlFor="watermark-pages"
            help={
              pagesError ? (
                <span id="watermark-pages-error" className="text-[color:var(--error)]">
                  {pagesError}
                </span>
              ) : pages ? (
                `${plural(pages.length, "page", "pages")} selected.`
              ) : (
                "Leave blank for every page, or pick some, like 1-3, 5."
              )
            }
          >
            <TextInput
              id="watermark-pages"
              value={pagesText}
              onChange={(e) => setPagesText(e.target.value)}
              placeholder="All pages"
              disabled={doc.status !== "ready"}
              aria-invalid={Boolean(pagesError)}
              aria-describedby={pagesError ? "watermark-pages-error" : undefined}
              autoComplete="off"
              inputMode="numeric"
            />
          </Field>

          <Button variant="primary" icon={Stamp} onClick={start} disabled={!ready || job.status === "working"}>
            Add watermark
          </Button>
        </div>
      </InputPanel>

      <OutputPanel
        label="Watermarked PDF"
        copyable={false}
        download={job.status === "done" ? { filename: outName, mimeType: "application/pdf", content: job.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className={muted}>{file ? "Set the text and style, then add the watermark." : "Choose a PDF to watermark."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label={progressLabel(job.progress)}
              value={job.progress.phase === "stamping" ? job.progress.done / job.progress.total : undefined}
              onCancel={() => {
                run.current++;
                cancelJob.current();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't add the watermark">{job.error}</Alert>
          ) : (
            <div className="space-y-3 font-[family-name:var(--font-ui)]">
              <p className="text-base">
                Stamped <span className="font-semibold">{plural(job.pages, "page", "pages")}</span>
                <span className="text-[color:var(--text-muted)]"> · {formatBytes(job.bytes.length)}</span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">{outName}</p>
              {job.preview && (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL; next/image can't optimise it
                <img
                  src={job.preview}
                  alt={`Preview of page ${(pages?.[0] ?? 0) + 1} with the watermark`}
                  className="max-h-80 w-auto max-w-full rounded border border-[color:var(--border)] bg-white"
                />
              )}
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

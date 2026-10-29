"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListOrdered } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import TextInput from "@/components/ui/TextInput";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { PDF_COLOR_OPTIONS, type PdfColor } from "@/lib/tools/files/pdf-colors";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import {
  formatPageNumber,
  type HorizontalPosition,
  type NumberFont,
  type NumberFormat,
  type PageNumberOptions,
  type PageNumbersProgress,
  type VerticalPosition,
} from "@/lib/tools/files/pdf-page-numbers";
import type { PdfPageNumbersRequest } from "@/lib/tools/files/pdf-page-numbers.worker";
import { openPdfRenderer } from "@/lib/tools/files/pdf-render";
import { parsePageRanges, rangeIndexes } from "@/lib/tools/files/pdf-split";
import { runWorkerTask } from "@/lib/worker-task";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-page-numbers.worker.ts", import.meta.url));
}

const POSITIONS: { vertical: VerticalPosition; horizontal: HorizontalPosition; label: string }[] = [
  { vertical: "top", horizontal: "left", label: "Top left" },
  { vertical: "top", horizontal: "center", label: "Top center" },
  { vertical: "top", horizontal: "right", label: "Top right" },
  { vertical: "bottom", horizontal: "left", label: "Bottom left" },
  { vertical: "bottom", horizontal: "center", label: "Bottom center" },
  { vertical: "bottom", horizontal: "right", label: "Bottom right" },
];

const FORMATS: NumberFormat[] = ["n", "page-n", "n-of-total", "page-n-of-total"];

const FONTS: { id: NumberFont; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

/** In points: about 6, 13 and 19 mm. */
const MARGINS = [
  { id: "18", label: "Small" },
  { id: "36", label: "Medium" },
  { id: "54", label: "Large" },
] as const;

type Doc = { status: "none" } | { status: "opening" } | { status: "ready"; pages: number } | { status: "error"; error: string };

type Job =
  | { status: "idle" }
  | { status: "working"; progress: PageNumbersProgress }
  | { status: "done"; bytes: Uint8Array; pages: number; preview: string | null }
  | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

function progressLabel(progress: PageNumbersProgress): string {
  if (progress.phase === "reading") return "Reading PDF…";
  if (progress.phase === "saving") return "Saving…";
  return `Numbering page ${progress.done + 1} of ${progress.total}…`;
}

/** A whole number in range, or null. */
function parseWhole(value: string, min: number, max: number): number | null {
  const n = Number(value);
  return value.trim() && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export default function PdfPageNumbers() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc>({ status: "none" });
  const [position, setPosition] = useState(4);
  const [mirror, setMirror] = useState(false);
  const [margin, setMargin] = useState<(typeof MARGINS)[number]["id"]>("36");
  const [format, setFormat] = useState<NumberFormat>("n");
  const [font, setFont] = useState<NumberFont>("sans");
  const [sizeText, setSizeText] = useState("11");
  const [bold, setBold] = useState(false);
  const [color, setColor] = useState<PdfColor>("black");
  const [startText, setStartText] = useState("1");
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
        const task = runWorkerTask<PdfPageNumbersRequest, never, number>(createWorker, { kind: "count", bytes }, { transfer: [bytes] });
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
  }, [file, position, mirror, margin, format, font, sizeText, bold, color, startText, pagesText]);

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

  const size = parseWhole(sizeText, 6, 72);
  const start = parseWhole(startText, 0, 99_999);
  const blank = !pagesText.trim();
  const parsed = useMemo(() => (doc.status === "ready" && !blank ? parsePageRanges(pagesText, doc.pages) : null), [doc, pagesText, blank]);
  // Numbers run through the chosen pages in page order, each page once.
  const pages = useMemo(() => (parsed?.ok ? [...new Set(parsed.ranges.flatMap(rangeIndexes))].sort((a, b) => a - b) : undefined), [parsed]);
  const pagesError = parsed && !parsed.ok ? parsed.error : null;
  const count = pages?.length ?? (doc.status === "ready" ? doc.pages : 0);
  const ready = doc.status === "ready" && size !== null && start !== null && !pagesError;
  const { vertical, horizontal } = POSITIONS[position];

  async function addNumbers() {
    if (!file || !ready || size === null || start === null) return;
    const id = ++run.current;
    const options: PageNumberOptions = { vertical, horizontal, mirror, margin: Number(margin), format, font, size, bold, color, start };
    setJob({ status: "working", progress: { phase: "reading" } });
    try {
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfPageNumbersRequest, PageNumbersProgress, Uint8Array>(createWorker, { kind: "number", bytes, options, pages }, {
        transfer: [bytes],
        onProgress: (progress) => setJob({ status: "working", progress }),
      });
      cancelJob.current = task.cancel;
      const out = await task.result;
      setJob({ status: "done", bytes: out, pages: count, preview: null });
      // A look at the first numbered page. Optional: if pdf.js can't draw it, the result is still there.
      const renderer = await openPdfRenderer(out).catch(() => null);
      const blob = await renderer?.thumbnail(pages?.[0] ?? 0, 320).catch(() => null);
      renderer?.destroy();
      if (blob && run.current === id) setJob({ status: "done", bytes: out, pages: count, preview: URL.createObjectURL(blob) });
    } catch (err) {
      if ((err as Error).message !== "cancelled") setJob({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-numbered.pdf") : "numbered.pdf";
  const exampleTotal = (start ?? 1) + Math.max(count, 1) - 1;

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

          <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Position</legend>
              {/* A small page with a spot for each position; native radios keep arrow-key moves and screen reader names. */}
              <div className="grid h-36 w-28 grid-cols-3 content-between rounded border border-[color:var(--border)] bg-[color:var(--surface)] p-1.5">
                {POSITIONS.map((p, i) => (
                  <label key={p.label} className="flex cursor-pointer justify-center p-1" title={p.label}>
                    <input type="radio" name="number-position" checked={position === i} onChange={() => setPosition(i)} className="peer sr-only" />
                    <span className="sr-only">{p.label}</span>
                    <span
                      aria-hidden
                      className="h-3 w-5 rounded-sm border border-[color:var(--border)] bg-[color:var(--surface-raised)] peer-checked:border-[color:var(--accent)] peer-checked:bg-[color:var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--accent)]"
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">{POSITIONS[position].label}</p>
            </fieldset>

            <div className="space-y-5">
              <Field label="Format" htmlFor="number-format">
                <Select id="number-format" value={format} onChange={(e) => setFormat(e.target.value as NumberFormat)}>
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {formatPageNumber(f, start ?? 1, exampleTotal)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Margin">
                <SegmentedControl label="Margin" options={MARGINS} value={margin} onChange={setMargin} />
              </Field>
              {horizontal !== "center" && (
                <Checkbox checked={mirror} onChange={setMirror}>
                  Swap sides on even pages, for printed booklets
                </Checkbox>
              )}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Font">
              <SegmentedControl label="Font" options={FONTS} value={font} onChange={setFont} />
            </Field>
            <Field label="Color">
              <SegmentedControl label="Color" options={PDF_COLOR_OPTIONS} value={color} onChange={setColor} />
            </Field>
            <Field
              label="Size"
              htmlFor="number-size"
              help={size === null ? <span className="text-[color:var(--error)]">Use a whole number from 6 to 72.</span> : "In points. Body text is usually 10 to 12."}
            >
              <div className="flex items-center gap-4">
                <TextInput
                  id="number-size"
                  type="number"
                  min={6}
                  max={72}
                  value={sizeText}
                  onChange={(e) => setSizeText(e.target.value)}
                  aria-invalid={size === null}
                  className="w-24"
                />
                <Checkbox checked={bold} onChange={setBold}>
                  Bold
                </Checkbox>
              </div>
            </Field>
            <Field
              label="First number"
              htmlFor="number-start"
              help={start === null ? <span className="text-[color:var(--error)]">Use a whole number, 0 or more.</span> : "The number the first numbered page shows."}
            >
              <TextInput
                id="number-start"
                type="number"
                min={0}
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                aria-invalid={start === null}
                className="w-24"
              />
            </Field>
          </div>

          <Field
            label="Pages to number"
            htmlFor="number-pages"
            help={
              pagesError ? (
                <span id="number-pages-error" className="text-[color:var(--error)]">
                  {pagesError}
                </span>
              ) : pages ? (
                `${plural(pages.length, "page", "pages")} numbered, from ${start ?? 1}.`
              ) : (
                "Leave blank for every page. To skip a cover page, enter 2-."
              )
            }
          >
            <TextInput
              id="number-pages"
              value={pagesText}
              onChange={(e) => setPagesText(e.target.value)}
              placeholder="All pages"
              disabled={doc.status !== "ready"}
              aria-invalid={Boolean(pagesError)}
              aria-describedby={pagesError ? "number-pages-error" : undefined}
              autoComplete="off"
              inputMode="numeric"
            />
          </Field>

          <Button variant="primary" icon={ListOrdered} onClick={addNumbers} disabled={!ready || job.status === "working"}>
            Add page numbers
          </Button>
        </div>
      </InputPanel>

      <OutputPanel
        label="Numbered PDF"
        copyable={false}
        download={job.status === "done" ? { filename: outName, mimeType: "application/pdf", content: job.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className={muted}>{file ? "Choose where and how the numbers look, then add them." : "Choose a PDF to number."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label={progressLabel(job.progress)}
              value={job.progress.phase === "numbering" ? job.progress.done / job.progress.total : undefined}
              onCancel={() => {
                run.current++;
                cancelJob.current();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't add page numbers">{job.error}</Alert>
          ) : (
            <div className="space-y-3 font-[family-name:var(--font-ui)]">
              <p className="text-base">
                Numbered <span className="font-semibold">{plural(job.pages, "page", "pages")}</span>
                <span className="text-[color:var(--text-muted)]"> · {formatBytes(job.bytes.length)}</span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">{outName}</p>
              {job.preview && (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL; next/image can't optimise it
                <img
                  src={job.preview}
                  alt={`Preview of page ${(pages?.[0] ?? 0) + 1} with its number`}
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

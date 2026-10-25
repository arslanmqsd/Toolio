"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors } from "lucide-react";
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
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import { parsePageRanges, rangeIndexes, rangeLabel, type PageRange, type SplitProgress } from "@/lib/tools/files/pdf-split";
import type { PdfSplitRequest } from "@/lib/tools/files/pdf-split.worker";
import { runWorkerTask } from "@/lib/worker-task";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-split.worker.ts", import.meta.url));
}

type Mode = "single" | "perRange" | "perPage";

const MODES: { id: Mode; label: string }[] = [
  { id: "single", label: "One PDF" },
  { id: "perRange", label: "One PDF per range" },
  { id: "perPage", label: "One PDF per page" },
];

type Doc = { status: "none" } | { status: "opening" } | { status: "ready"; pages: number } | { status: "error"; error: string };

interface Output {
  name: string;
  bytes: Uint8Array;
  pages: number;
}

type SplitState = { status: "idle" } | { status: "working"; progress: SplitProgress } | { status: "done"; outputs: Output[] } | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

function progressLabel(progress: SplitProgress): string {
  return progress.phase === "reading" ? "Reading PDF…" : `Making file ${progress.done + 1} of ${progress.total}…`;
}

/** "report-pages-1-3.pdf", "report-page-4.pdf"; a long list of ranges falls back to "report-extract.pdf". */
function outputName(file: File, ranges: PageRange[]): string {
  const base = file.name.replace(/\.pdf$/i, "");
  const labels = ranges.map(rangeLabel).join("_");
  const word = ranges.length === 1 && ranges[0].from === ranges[0].to ? "page" : "pages";
  return labels.length <= 40 ? `${base}-${word}-${labels}.pdf` : `${base}-extract.pdf`;
}

const pageCount = (r: PageRange) => Math.abs(r.to - r.from) + 1;

/** Says exactly what Extract will make, so the two modes' difference is visible before running it. */
function saveAsHelp(mode: Mode, ranges: PageRange[] | null): string {
  if (!ranges) {
    if (mode === "single") return "All the pages go into one PDF.";
    return mode === "perRange" ? "Each range, like 1-3 or 5, becomes its own PDF." : "Each page becomes its own PDF.";
  }
  const total = ranges.reduce((sum, r) => sum + pageCount(r), 0);
  if (mode === "single") return `You'll get 1 PDF with ${plural(total, "page", "pages")}.`;
  if (mode === "perPage") return total === 1 ? "Only one page is selected, so this makes one PDF." : `You'll get ${total.toLocaleString("en-US")} PDFs, one for each page.`;
  if (ranges.length === 1) {
    return "There's only one range, so this makes one PDF too. Choose One PDF per page to get each page on its own, or separate ranges with commas, like 1-3, 5.";
  }
  const listed = ranges.slice(0, 4).map((r) => `${r.from === r.to ? "page" : "pages"} ${rangeLabel(r)}`).join(", ");
  return `You'll get ${ranges.length} PDFs: ${listed}${ranges.length > 4 ? ` and ${ranges.length - 4} more` : ""}.`;
}

export default function PdfSplitter() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc>({ status: "none" });
  const [pagesText, setPagesText] = useState("");
  const [mode, setMode] = useState<Mode>("single");
  const [split, setSplit] = useState<SplitState>({ status: "idle" });
  const cancelSplit = useRef(() => {});

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
        const task = runWorkerTask<PdfSplitRequest, never, number>(createWorker, { kind: "count", bytes }, { transfer: [bytes] });
        cancelTask = task.cancel;
        return task.result.then((pages) => setDoc({ status: "ready", pages }));
      })
      .catch((err: Error) => !cancelled && setDoc({ status: "error", error: pdfErrorMessage(err.message) }));
    return () => {
      cancelled = true;
      cancelTask();
    };
  }, [file]);

  // A new file, page list or mode makes an earlier result out of date.
  useEffect(() => {
    cancelSplit.current();
    setSplit({ status: "idle" });
  }, [file, pagesText, mode]);

  useEffect(() => () => cancelSplit.current(), []);

  const parsed = useMemo(() => (doc.status === "ready" ? parsePageRanges(pagesText, doc.pages) : null), [doc, pagesText]);
  const ranges = parsed?.ok ? parsed.ranges : null;
  const selectedPages = ranges?.reduce((sum, r) => sum + pageCount(r), 0) ?? 0;

  async function start() {
    if (!file || !ranges) return;
    const parts: PageRange[][] =
      mode === "single"
        ? [ranges]
        : mode === "perRange"
          ? ranges.map((r) => [r])
          : ranges.flatMap(rangeIndexes).map((i) => [{ from: i + 1, to: i + 1 }]);
    const groups = parts.map((p) => p.flatMap(rangeIndexes));
    const names = parts.map((p) => outputName(file, p));
    setSplit({ status: "working", progress: { phase: "reading" } });
    try {
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfSplitRequest, SplitProgress, Uint8Array[]>(createWorker, { kind: "split", bytes, groups }, {
        transfer: [bytes],
        onProgress: (progress) => setSplit({ status: "working", progress }),
      });
      cancelSplit.current = task.cancel;
      const outputs = await task.result;
      setSplit({ status: "done", outputs: outputs.map((out, i) => ({ name: names[i], bytes: out, pages: groups[i].length })) });
    } catch (err) {
      if ((err as Error).message !== "cancelled") setSplit({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  const single = split.status === "done" && split.outputs.length === 1 ? split.outputs[0] : null;

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
            htmlFor="pdf-pages"
            help={
              parsed && !parsed.ok && pagesText.trim() ? (
                <span id="pdf-pages-error" className="text-[color:var(--error)]">
                  {parsed.error}
                </span>
              ) : ranges ? (
                `${plural(selectedPages, "page", "pages")} selected.`
              ) : (
                "Like 1-3, 5, 8- (8- runs to the last page). Ranges can run backwards: 5-1."
              )
            }
          >
            <TextInput
              id="pdf-pages"
              value={pagesText}
              onChange={(e) => setPagesText(e.target.value)}
              placeholder={doc.status === "ready" && doc.pages > 1 ? `1-${doc.pages}` : "1-3, 5"}
              disabled={doc.status !== "ready"}
              aria-invalid={Boolean(parsed && !parsed.ok && pagesText.trim())}
              aria-describedby={parsed && !parsed.ok && pagesText.trim() ? "pdf-pages-error" : undefined}
              autoComplete="off"
              inputMode="numeric"
            />
          </Field>

          <Field label="Save as" help={saveAsHelp(mode, ranges)}>
            <SegmentedControl label="Save as" options={MODES} value={mode} onChange={setMode} />
          </Field>

          <Button variant="primary" icon={Scissors} onClick={start} disabled={!ranges || split.status === "working"}>
            Extract pages
          </Button>
        </div>
      </InputPanel>

      <OutputPanel
        label={split.status === "done" && split.outputs.length > 1 ? "PDFs" : "Extracted PDF"}
        copyable={false}
        download={single ? { filename: single.name, mimeType: "application/pdf", content: single.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={split.status === "working"}>
          {split.status === "idle" ? (
            <p className={muted}>{file ? "Choose the pages, then extract them." : "Choose a PDF to pick pages from."}</p>
          ) : split.status === "working" ? (
            <TaskProgress
              label={progressLabel(split.progress)}
              value={split.progress.phase === "writing" ? split.progress.done / split.progress.total : undefined}
              onCancel={() => {
                cancelSplit.current();
                setSplit({ status: "idle" });
              }}
            />
          ) : split.status === "error" ? (
            <Alert title="Couldn't extract these pages">{split.error}</Alert>
          ) : single ? (
            <div className="space-y-1 font-[family-name:var(--font-ui)]">
              <p className="text-base">
                <span className="font-semibold">{plural(single.pages, "page", "pages")}</span>
                <span className="text-[color:var(--text-muted)]"> · {formatBytes(single.bytes.length)}</span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">{single.name}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--border)] font-[family-name:var(--font-ui)]">
              {split.outputs.map((out, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 break-all text-sm">
                    {out.name}
                    <span className="block text-xs text-[color:var(--text-muted)]">
                      {plural(out.pages, "page", "pages")} · {formatBytes(out.bytes.length)}
                    </span>
                  </span>
                  <DownloadButton content={out.bytes as Uint8Array<ArrayBuffer>} filename={out.name} mimeType="application/pdf" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

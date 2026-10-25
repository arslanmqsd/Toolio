"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import type { CompressProgress, CompressResult, LevelId } from "@/lib/tools/files/pdf-compress";
import { pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import type { PdfCompressRequest } from "@/lib/tools/files/pdf-compress.worker";
import { runWorkerTask } from "@/lib/worker-task";

// The original, the decoded images and the new file are all in memory at once; past this, tabs (phones first) run out.
const MAX_BYTES = 100 * 1024 * 1024;

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-compress.worker.ts", import.meta.url));
}

const LEVEL_OPTIONS: { id: LevelId; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "strong", label: "Strong" },
];

const LEVEL_HELP: Record<LevelId, string> = {
  light: "Images stay sharp enough to print.",
  medium: "Good for reading on screen and email.",
  strong: "Smallest file; photos get visibly softer.",
};

type State = { status: "idle" } | { status: "working"; progress: CompressProgress } | { status: "done"; result: CompressResult } | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

/** "38% smaller", or "less than 1% smaller" rather than a misleading "0%". */
function savedLabel(before: number, after: number): string {
  const percent = Math.round((1 - after / before) * 100);
  return percent < 1 ? "less than 1% smaller" : `${percent}% smaller`;
}

export default function PdfCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<LevelId>("medium");
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!file) return setState({ status: "idle" });
    if (file.size > MAX_BYTES) return setState({ status: "error", error: `This file is over ${formatBytes(MAX_BYTES)}, too big to process in the browser.` });
    let cancelled = false;
    let cancelTask = () => {};
    setState({ status: "working", progress: { phase: "reading" } });
    file
      .arrayBuffer()
      .then((bytes) => {
        if (cancelled) return;
        const task = runWorkerTask<PdfCompressRequest, CompressProgress, CompressResult>(createWorker, { bytes, level }, {
          transfer: [bytes],
          onProgress: (progress) => setState({ status: "working", progress }),
        });
        cancelTask = task.cancel;
        return task.result.then((result) => setState({ status: "done", result }));
      })
      .catch((err: Error) => !cancelled && setState({ status: "error", error: pdfErrorMessage(err.message) }));
    // Changing the level, clearing the file or leaving the page stops the run in progress.
    return () => {
      cancelled = true;
      cancelTask();
    };
  }, [file, level]);

  const result = state.status === "done" ? state.result : null;
  const smaller = result && file ? result.bytes.length < file.size : false;
  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-compressed.pdf") : "compressed.pdf";

  return (
    <>
      <InputPanel label="PDF">
        <div className="space-y-5">
          {file ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[color:var(--border)] p-3 text-sm">
              <span className="min-w-0 break-all">
                {file.name} <span className="text-[color:var(--text-muted)]">({formatBytes(file.size)})</span>
              </span>
              <Button icon={X} size="sm" onClick={() => setFile(null)}>
                Clear
              </Button>
            </div>
          ) : (
            <FileDrop onFiles={([f]) => setFile(f)} accept="application/pdf,.pdf" what="a PDF" />
          )}

          <Field label="Compression" help={LEVEL_HELP[level]}>
            <SegmentedControl label="Compression" options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
          </Field>

          <p className={`text-xs ${muted}`}>
            Photos, scans and screenshots inside the PDF are re-saved as smaller JPEGs. Text stays selectable and
            drawings stay sharp, so PDFs that are mostly text won&apos;t shrink much.
          </p>
        </div>
      </InputPanel>

      <OutputPanel
        label="Compressed PDF"
        copyable={false}
        download={result && smaller ? { filename: outName, mimeType: "application/pdf", content: result.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={state.status === "working"}>
          {state.status === "idle" ? (
            <p className={muted}>Choose a PDF to compress it.</p>
          ) : state.status === "working" ? (
            <TaskProgress
              label={progressLabel(state.progress)}
              value={state.progress.phase === "images" && state.progress.total > 0 ? state.progress.done / state.progress.total : undefined}
              onCancel={() => setFile(null)}
            />
          ) : state.status === "error" ? (
            <Alert title="Couldn't compress this PDF">{state.error}</Alert>
          ) : file && result ? (
            <div className="space-y-2 font-[family-name:var(--font-ui)]">
              <p className="text-base tabular-nums">
                {formatBytes(file.size)} → <span className="font-semibold">{formatBytes(result.bytes.length)}</span>
                {smaller && <span className="text-[color:var(--text-muted)]"> ({savedLabel(file.size, result.bytes.length)})</span>}
              </p>
              <p className="text-sm text-[color:var(--text-muted)]">
                {result.images === 0
                  ? "No images found."
                  : `${result.recompressed.toLocaleString("en-US")} of ${plural(result.images, "image", "images")} recompressed.`}
              </p>
              {!smaller && (
                <p className="text-sm">
                  This PDF is already as small as this tool can make it
                  {level !== "strong" ? ". Try Strong compression." : "."}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </OutputPanel>
    </>
  );
}

function progressLabel(progress: CompressProgress): string {
  if (progress.phase === "reading") return "Reading PDF…";
  if (progress.phase === "saving") return "Saving…";
  return `Compressing image ${Math.min(progress.done + 1, progress.total)} of ${progress.total.toLocaleString("en-US")}…`;
}

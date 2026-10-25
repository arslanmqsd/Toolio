"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import type { CompressProgress, CompressResult, LevelId } from "@/lib/tools/files/pdf-compress";
import type { PdfJobMessage, PdfJobRequest } from "@/lib/tools/files/pdf-compress.worker";

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

function errorMessage(message: string): string {
  if (/encrypt/i.test(message)) return "This PDF is password-protected. Remove the password first, then try again.";
  return "This file couldn't be read as a PDF. It may be damaged or not a PDF at all.";
}

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
    const worker = createWorker();
    setState({ status: "working", progress: { phase: "reading" } });
    worker.onmessage = ({ data }: MessageEvent<PdfJobMessage>) => {
      if (data.type === "progress") setState({ status: "working", progress: data.progress });
      else if (data.type === "done") setState({ status: "done", result: data.result });
      else setState({ status: "error", error: errorMessage(data.error) });
    };
    // Fires when the worker itself dies, usually from running out of memory on a huge file.
    worker.onerror = () => setState({ status: "error", error: "The browser ran out of memory compressing this file. Try a smaller PDF." });
    file.arrayBuffer().then(
      (bytes) => !cancelled && worker.postMessage({ bytes, level } satisfies PdfJobRequest, [bytes]),
      () => !cancelled && setState({ status: "error", error: "The browser couldn't read this file." }),
    );
    // Changing the level, clearing the file or leaving the page stops the run in progress.
    return () => {
      cancelled = true;
      worker.terminate();
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
            <Progress progress={state.progress} onCancel={() => setFile(null)} />
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

function Progress({ progress, onCancel }: { progress: CompressProgress; onCancel: () => void }) {
  const label =
    progress.phase === "reading"
      ? "Reading PDF…"
      : progress.phase === "saving"
        ? "Saving…"
        : `Compressing image ${Math.min(progress.done + 1, progress.total)} of ${progress.total.toLocaleString("en-US")}…`;
  return (
    <div className={`space-y-3 ${muted}`}>
      <p>{label}</p>
      {/* No value while reading or saving: those steps can't report how far along they are. */}
      <progress
        value={progress.phase === "images" && progress.total > 0 ? progress.done / progress.total : undefined}
        max={1}
        aria-label="Compression progress"
        className="h-1.5 w-full accent-[color:var(--accent)]"
      />
      <Button size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

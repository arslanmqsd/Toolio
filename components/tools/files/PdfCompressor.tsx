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
import { LEVELS, browserJpegEncoder, compressPdf, type CompressResult, type LevelId } from "@/lib/tools/files/pdf-compress";

const MAX_BYTES = 200 * 1024 * 1024;

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

type State = { status: "idle" } | { status: "working" } | { status: "done"; result: CompressResult } | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

function errorMessage(err: unknown): string {
  const message = (err as Error)?.message ?? "";
  if (/encrypt/i.test(message)) return "This PDF is password-protected. Remove the password first, then try again.";
  return "This file couldn't be read as a PDF. It may be damaged or not a PDF at all.";
}

export default function PdfCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<LevelId>("medium");
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!file) return setState({ status: "idle" });
    if (file.size > MAX_BYTES) return setState({ status: "error", error: `This file is over ${formatBytes(MAX_BYTES)}, too big to process in the browser.` });
    let cancelled = false;
    setState({ status: "working" });
    file
      .arrayBuffer()
      .then((buffer) => compressPdf(new Uint8Array(buffer), LEVELS[level], browserJpegEncoder))
      .then(
        (result) => !cancelled && setState({ status: "done", result }),
        (err) => !cancelled && setState({ status: "error", error: errorMessage(err) }),
      );
    return () => {
      cancelled = true;
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
            Photos and scans inside the PDF are re-saved at lower quality and size. Text stays selectable and
            drawings stay sharp, so PDFs that are mostly text won&apos;t shrink much.
          </p>
        </div>
      </InputPanel>

      <OutputPanel
        label="Compressed PDF"
        download={result && smaller ? { filename: outName, mimeType: "application/pdf", content: result.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite">
          {state.status === "idle" ? (
            <p className={muted}>Choose a PDF to compress it.</p>
          ) : state.status === "working" ? (
            <p className={muted}>Compressing…</p>
          ) : state.status === "error" ? (
            <Alert title="Couldn't compress this PDF">{state.error}</Alert>
          ) : file && result ? (
            <div className="space-y-2 font-[family-name:var(--font-ui)]">
              <p className="text-base tabular-nums">
                {formatBytes(file.size)} → <span className="font-semibold">{formatBytes(result.bytes.length)}</span>
                {smaller && <span className="text-[color:var(--text-muted)]"> ({Math.round((1 - result.bytes.length / file.size) * 100)}% smaller)</span>}
              </p>
              <p className="text-sm text-[color:var(--text-muted)]">
                {result.images === 0
                  ? "No images found."
                  : `${plural(result.recompressed, "image", "images")} of ${result.images.toLocaleString("en-US")} recompressed.`}
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

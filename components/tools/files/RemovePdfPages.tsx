"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, ZoomIn } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import FileDrop from "@/components/ui/FileDrop";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import TextInput from "@/components/ui/TextInput";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { saveFile } from "@/lib/save-file";
import { pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import type { PdfOrganizeRequest } from "@/lib/tools/files/pdf-organize.worker";
import type { PdfRenderer } from "@/lib/tools/files/pdf-render";
import { compactRanges, parsePageRanges, rangeIndexes } from "@/lib/tools/files/pdf-split";
import { runWorkerTask } from "@/lib/worker-task";
import { createOrganizeWorker, usePdfPages } from "./usePdfPages";

/** Longest side of a card's preview, in CSS pixels. */
const THUMB_SIZE = 200;
/** Longest side of the zoomed preview, in CSS pixels. */
const ZOOM_SIZE = 900;

type Job = { status: "idle" } | { status: "working" } | { status: "done"; bytes: Uint8Array; removed: number; left: number } | { status: "error"; error: string };

/** A big view of one page, with a way to step through pages and mark them from there. */
function ZoomDialog({
  renderer,
  index,
  pageCount,
  removing,
  onToggle,
  onGo,
  onClose,
}: {
  renderer: PdfRenderer | null;
  index: number | null;
  pageCount: number;
  removing: boolean;
  onToggle: () => void;
  onGo: (index: number) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (index === null || !renderer) return;
    let made: string | null = null;
    let cancelled = false;
    setUrl(null);
    renderer
      .thumbnail(index, ZOOM_SIZE)
      .then((blob) => {
        if (cancelled) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [renderer, index]);

  const open = index !== null;
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={open ? `Page ${index + 1} of ${pageCount}` : ""}>
      {open && (
        <div className="space-y-4">
          <div className="flex h-[65vh] items-center justify-center rounded bg-[color:var(--surface)] p-2">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing for next/image to optimise
              <img src={url} alt={`Page ${index + 1}`} className={`max-h-full max-w-full shadow ${removing ? "opacity-40" : ""}`} />
            ) : (
              <span className="text-sm text-[color:var(--text-muted)]">Drawing page…</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={ChevronLeft} onClick={() => onGo(index - 1)} disabled={index === 0} aria-label="Previous page" />
            <Button size="sm" icon={ChevronRight} onClick={() => onGo(index + 1)} disabled={index === pageCount - 1} aria-label="Next page" />
            <Button size="sm" icon={Trash2} variant={removing ? "secondary" : "primary"} onClick={onToggle} className="ml-auto">
              {removing ? "Keep this page" : "Remove this page"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export default function RemovePdfPages() {
  const [file, setFile] = useState<File | null>(null);
  const { doc, thumbs, renderer } = usePdfPages(file, THUMB_SIZE);
  const [removing, setRemoving] = useState<Set<number>>(new Set());
  const [spec, setSpec] = useState("");
  const [specError, setSpecError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [job, setJob] = useState<Job>({ status: "idle" });
  const cancelJob = useRef(() => {});
  const specId = useId();
  const specHelpId = useId();
  const pageCount = doc.status === "ready" ? doc.pages : 0;

  // A new file starts with nothing marked.
  useEffect(() => {
    setRemoving(new Set());
    setSpec("");
    setSpecError(null);
  }, [doc]);

  // Changing the pages makes an earlier result out of date.
  useEffect(() => {
    cancelJob.current();
    setJob({ status: "idle" });
  }, [file, removing]);

  useEffect(() => () => cancelJob.current(), []);

  /** Sets the pages to remove and writes them into the box, so clicks and typing stay in step. */
  function mark(next: Set<number>) {
    setRemoving(next);
    setSpec(compactRanges([...next]));
    setSpecError(null);
  }

  function toggle(index: number) {
    const next = new Set(removing);
    if (!next.delete(index)) next.add(index);
    mark(next);
  }

  function typeSpec(text: string) {
    setSpec(text);
    if (!text.trim()) {
      setSpecError(null);
      return setRemoving(new Set());
    }
    const parsed = parsePageRanges(text, pageCount);
    if (!parsed.ok) return setSpecError(parsed.error);
    setSpecError(null);
    setRemoving(new Set(parsed.ranges.flatMap(rangeIndexes)));
  }

  const left = pageCount - removing.size;
  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-pages-removed.pdf") : "pages-removed.pdf";

  async function start() {
    if (!file || !removing.size || !left) return;
    const edits = Array.from({ length: pageCount }, (_, index) => index)
      .filter((i) => !removing.has(i))
      .map((index) => ({ index, turns: 0 }));
    setJob({ status: "working" });
    try {
      const bytes = await file.arrayBuffer();
      // A fresh file of the kept pages: deleting pages in place would leave their content hidden in the file.
      const task = runWorkerTask<PdfOrganizeRequest, never, Uint8Array>(createOrganizeWorker, { kind: "organize", bytes, edits }, { transfer: [bytes] });
      cancelJob.current = task.cancel;
      const result = await task.result;
      setJob({ status: "done", bytes: result, removed: removing.size, left });
      saveFile(result as Uint8Array<ArrayBuffer>, outName, "application/pdf");
    } catch (err) {
      if ((err as Error).message !== "cancelled") setJob({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  return (
    <>
      <InputPanel label="Pages" wide>
        <div className="space-y-4">
          {file ? (
            <SelectedFile
              file={file}
              onClear={() => setFile(null)}
              detail={doc.status === "ready" ? plural(pageCount, "page", "pages") : doc.status === "opening" ? "opening…" : undefined}
            />
          ) : (
            <FileDrop onFiles={([f]) => setFile(f)} accept="application/pdf,.pdf" what="a PDF" />
          )}

          {doc.status === "error" && <Alert title="Couldn't open this PDF">{doc.error}</Alert>}

          {doc.status === "ready" && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <label htmlFor={specId} className="block text-sm">
                    Pages to remove
                  </label>
                  <TextInput
                    id={specId}
                    value={spec}
                    onChange={(e) => typeSpec(e.target.value)}
                    placeholder="e.g. 2, 5-7"
                    aria-invalid={specError !== null}
                    aria-describedby={specHelpId}
                    className="w-56"
                  />
                </div>
                <Button size="sm" onClick={() => mark(new Set())} disabled={!removing.size}>
                  Clear
                </Button>
                <p id={specHelpId} aria-live="polite" className={`text-sm ${specError || (removing.size && !left) ? "text-[color:var(--error)]" : "text-[color:var(--text-muted)]"}`}>
                  {specError ??
                    (!removing.size
                      ? "Click pages to remove them, or type page numbers."
                      : !left
                        ? "A PDF needs at least one page: keep one."
                        : `Removing ${plural(removing.size, "page", "pages")}, ${plural(left, "page", "pages")} left.`)}
                </p>
              </div>

              <ol className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {Array.from({ length: pageCount }, (_, i) => {
                  const marked = removing.has(i);
                  return (
                    <li key={i} className="relative">
                      <button
                        type="button"
                        aria-pressed={marked}
                        aria-label={`Page ${i + 1}${marked ? ", to be removed" : ""}`}
                        onClick={() => toggle(i)}
                        className={`flex w-full flex-col rounded-md border-2 p-2 text-left ${
                          marked ? "border-[color:var(--error)] bg-[color:color-mix(in_srgb,var(--error)_8%,transparent)]" : "border-[color:var(--border)] hover:border-[color:var(--accent)]"
                        }`}
                      >
                        <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-[color:var(--surface)]">
                          {thumbs[i] ? (
                            // eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing for next/image to optimise
                            <img src={thumbs[i]} alt="" className={`max-h-full max-w-full shadow-sm ${marked ? "opacity-30" : ""}`} />
                          ) : (
                            <span className="text-2xl text-[color:var(--text-muted)]">{i + 1}</span>
                          )}
                          {marked && (
                            <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[color:var(--error)]">
                              <Trash2 className="h-6 w-6" />
                              <span className="text-xs font-medium">Remove</span>
                            </span>
                          )}
                        </span>
                        {/* Room on the right for the zoom button, which sits beside the label, off the page. */}
                        <span className="mt-1.5 pr-8 text-sm">Page {i + 1}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoom(i)}
                        aria-label={`Zoom in on page ${i + 1}`}
                        title="Zoom"
                        className="absolute bottom-2 right-2.5 rounded-md p-1.5 text-[color:var(--text-muted)] hover:bg-[color:var(--surface)] hover:text-[color:var(--text)]"
                      >
                        <ZoomIn aria-hidden className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ol>

              <Button variant="primary" icon={Trash2} onClick={start} disabled={!removing.size || !left || job.status === "working"}>
                {removing.size ? `Remove ${plural(removing.size, "page", "pages")}` : "Remove pages"}
              </Button>

              <ZoomDialog
                renderer={renderer}
                index={zoom}
                pageCount={pageCount}
                removing={zoom !== null && removing.has(zoom)}
                onToggle={() => zoom !== null && toggle(zoom)}
                onGo={setZoom}
                onClose={() => setZoom(null)}
              />
            </>
          )}
        </div>
      </InputPanel>

      <OutputPanel
        label="New PDF"
        wide
        copyable={false}
        download={job.status === "done" ? { filename: outName, mimeType: "application/pdf", content: job.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className="text-[color:var(--text-muted)]">{file ? "Pick the pages to remove, then press Remove." : "Choose a PDF."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label="Removing pages…"
              onCancel={() => {
                cancelJob.current();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't remove the pages">{job.error}</Alert>
          ) : (
            <div className="space-y-1">
              <p className="text-base">
                Removed <span className="font-semibold">{plural(job.removed, "page", "pages")}</span>
                <span className="text-[color:var(--text-muted)]">
                  {" "}
                  · {plural(job.left, "page", "pages")} left · {formatBytes(job.bytes.length)}
                </span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">Downloaded as {outName}. Use Download above to save it again.</p>
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

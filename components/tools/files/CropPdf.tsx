"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Crop, RotateCcw, ScanLine } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import FileDrop from "@/components/ui/FileDrop";
import LabelledControl from "@/components/ui/LabelledControl";
import SegmentedControl from "@/components/ui/SegmentedControl";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { saveFile } from "@/lib/save-file";
import { NO_CROP, clampMargins, contentMargins, isNoCrop, padMargins, unionMargins, type Margins, type PageCrop } from "@/lib/tools/files/pdf-crop";
import type { PdfCropRequest } from "@/lib/tools/files/pdf-crop.worker";
import { pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import type { PdfRenderer } from "@/lib/tools/files/pdf-render";
import { runWorkerTask } from "@/lib/worker-task";
import { usePdfPages } from "./usePdfPages";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-crop.worker.ts", import.meta.url));
}

/** Longest side of the page being cropped, in CSS pixels. */
const VIEW_SIZE = 720;
/** Pages are checked for white margins at this size: plenty to find the edges, quick to scan. */
const TRIM_SIZE = 400;
/** Room left round the content after trimming, as a share of the page. */
const TRIM_PAD = 0.01;
const MM_PER_PT = 25.4 / 72;

const SCOPES = [
  { id: "all", label: "All pages" },
  { id: "current", label: "Current page" },
] as const;
type Scope = (typeof SCOPES)[number]["id"];

/** Which part of the crop box a drag moves. */
type Grip = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const GRIPS: { id: Exclude<Grip, "move">; style: CSSProperties; cursor: string }[] = [
  { id: "nw", style: { left: 0, top: 0 }, cursor: "nwse-resize" },
  { id: "n", style: { left: "50%", top: 0 }, cursor: "ns-resize" },
  { id: "ne", style: { left: "100%", top: 0 }, cursor: "nesw-resize" },
  { id: "e", style: { left: "100%", top: "50%" }, cursor: "ew-resize" },
  { id: "se", style: { left: "100%", top: "100%" }, cursor: "nwse-resize" },
  { id: "s", style: { left: "50%", top: "100%" }, cursor: "ns-resize" },
  { id: "sw", style: { left: 0, top: "100%" }, cursor: "nesw-resize" },
  { id: "w", style: { left: 0, top: "50%" }, cursor: "ew-resize" },
];

/** Margins after dragging `grip` by (dx, dy), as shares of the page. */
function dragged(start: Margins, grip: Grip, dx: number, dy: number): Margins {
  if (grip === "move") {
    // The box keeps its size; it just can't leave the page.
    const x = Math.min(Math.max(dx, -start.left), start.right);
    const y = Math.min(Math.max(dy, -start.top), start.bottom);
    return { top: start.top + y, bottom: start.bottom - y, left: start.left + x, right: start.right - x };
  }
  const m = { ...start };
  if (grip.includes("n")) m.top += dy;
  if (grip.includes("s")) m.bottom -= dy;
  if (grip.includes("w")) m.left += dx;
  if (grip.includes("e")) m.right -= dx;
  return clampMargins(m);
}

/** A page drawn small, as RGBA pixels, to look for its content. */
async function pagePixels(renderer: PdfRenderer, index: number) {
  const bitmap = await createImageBitmap(await renderer.thumbnail(index, TRIM_SIZE));
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [bitmap.width, bitmap.height];
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

type Job = { status: "idle" } | { status: "working" } | { status: "done"; bytes: Uint8Array; pages: number } | { status: "error"; error: string };

export default function CropPdf() {
  const [file, setFile] = useState<File | null>(null);
  // No grid of previews here: just the page being cropped, drawn large.
  const { doc, renderer } = usePdfPages(file, 0);
  const [pageIndex, setPageIndex] = useState(0);
  const [view, setView] = useState<{ index: number; url: string; width: number; height: number } | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [allMargins, setAllMargins] = useState<Margins>(NO_CROP);
  const [perPage, setPerPage] = useState<Record<number, Margins>>({});
  const [trimming, setTrimming] = useState<string | null>(null);
  const [trimNote, setTrimNote] = useState<string | null>(null);
  const [job, setJob] = useState<Job>({ status: "idle" });
  const drag = useRef<{ grip: Grip; x: number; y: number; start: Margins } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const cancelJob = useRef(() => {});
  const pageCount = doc.status === "ready" ? doc.pages : 0;

  const margins = scope === "all" ? allMargins : (perPage[pageIndex] ?? NO_CROP);
  function setMargins(next: Margins) {
    if (scope === "all") setAllMargins(next);
    else setPerPage((p) => ({ ...p, [pageIndex]: next }));
  }

  // A new file starts uncropped on its first page.
  useEffect(() => {
    setPageIndex(0);
    setAllMargins(NO_CROP);
    setPerPage({});
    setTrimNote(null);
  }, [doc]);

  // Draw the page being cropped.
  useEffect(() => {
    if (!renderer) return setView(null);
    let cancelled = false;
    let url: string | null = null;
    Promise.all([renderer.size(pageIndex), renderer.thumbnail(pageIndex, VIEW_SIZE)])
      .then(([size, blob]) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setView({ index: pageIndex, url, ...size });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [renderer, pageIndex]);

  // Any change makes an earlier result out of date.
  useEffect(() => {
    cancelJob.current();
    setJob({ status: "idle" });
  }, [file, allMargins, perPage, scope]);

  useEffect(() => () => cancelJob.current(), []);

  /** Switching scope carries the box across, so what's on screen doesn't jump. */
  function changeScope(next: Scope) {
    if (next === scope) return;
    if (next === "current") setPerPage(isNoCrop(allMargins) ? {} : { [pageIndex]: allMargins });
    else setAllMargins(perPage[pageIndex] ?? NO_CROP);
    setScope(next);
    setTrimNote(null);
  }

  function onGripDown(grip: Grip, e: PointerEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { grip, x: e.clientX, y: e.clientY, start: margins };
  }

  function onGripMove(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    const rect = frame.current?.getBoundingClientRect();
    if (!d || !rect) return;
    setMargins(dragged(d.start, d.grip, (e.clientX - d.x) / rect.width, (e.clientY - d.y) / rect.height));
  }

  // Keyboard: arrows nudge the box (a point at a time, 10 with Shift).
  function onBoxKey(e: KeyboardEvent<HTMLElement>) {
    if (!view) return;
    const step = e.shiftKey ? 10 : 1;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!(e.key in move)) return;
    e.preventDefault();
    const [dx, dy] = move[e.key];
    setMargins(dragged(margins, "move", dx / view.width, dy / view.height));
  }

  /** Sets one side from millimetres on the current page. */
  function setSideMm(side: keyof Margins, mm: number) {
    if (!view || !Number.isFinite(mm)) return;
    const along = side === "left" || side === "right" ? view.width : view.height;
    setMargins(clampMargins({ ...margins, [side]: mm / MM_PER_PT / along }));
  }

  async function trimWhite() {
    if (!renderer) return;
    const pages = scope === "all" ? Array.from({ length: pageCount }, (_, i) => i) : [pageIndex];
    let found: Margins | null = null;
    try {
      for (const [n, index] of pages.entries()) {
        if (pages.length > 1) setTrimming(`Checking page ${n + 1} of ${pages.length}…`);
        else setTrimming("Checking the page…");
        const { data, width, height } = await pagePixels(renderer, index);
        const content = contentMargins(data, width, height);
        if (content) found = found ? unionMargins(found, content) : content;
      }
    } finally {
      setTrimming(null);
    }
    if (!found) return setTrimNote(scope === "all" ? "Every page is blank: nothing to trim to." : "This page is blank: nothing to trim to.");
    const trimmed = padMargins(found, TRIM_PAD);
    setMargins(clampMargins(trimmed));
    setTrimNote(isNoCrop(trimmed) ? "The content already reaches the edges: no white margins to trim." : scope === "all" ? "Trimmed to fit the content of every page." : null);
  }

  const crops: PageCrop[] =
    scope === "all"
      ? isNoCrop(allMargins)
        ? []
        : Array.from({ length: pageCount }, (_, page) => ({ page, margins: allMargins }))
      : Object.entries(perPage)
          .filter(([, m]) => !isNoCrop(m))
          .map(([page, m]) => ({ page: Number(page), margins: m }));
  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-cropped.pdf") : "cropped.pdf";

  async function start() {
    if (!file || !crops.length) return;
    setJob({ status: "working" });
    try {
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfCropRequest, never, Uint8Array>(createWorker, { bytes, crops }, { transfer: [bytes] });
      cancelJob.current = task.cancel;
      const result = await task.result;
      setJob({ status: "done", bytes: result, pages: crops.length });
      saveFile(result as Uint8Array<ArrayBuffer>, outName, "application/pdf");
    } catch (err) {
      if ((err as Error).message !== "cancelled") setJob({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  const mm = (share: number, along: number) => Math.round(share * along * MM_PER_PT);
  const keptMm = view ? [Math.round((1 - margins.left - margins.right) * view.width * MM_PER_PT), Math.round((1 - margins.top - margins.bottom) * view.height * MM_PER_PT)] : null;
  const croppedPages = scope === "current" ? Object.values(perPage).filter((m) => !isNoCrop(m)).length : 0;

  return (
    <>
      <InputPanel label="PDF" wide>
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
              <div className="flex flex-wrap items-center gap-3">
                <LabelledControl label="Apply to">
                  <SegmentedControl label="Apply to" options={SCOPES} value={scope} onChange={changeScope} />
                </LabelledControl>
                <Button size="sm" icon={ScanLine} onClick={trimWhite} disabled={!renderer || trimming !== null}>
                  Trim white margins
                </Button>
                <Button size="sm" icon={RotateCcw} onClick={() => setMargins(NO_CROP)} disabled={isNoCrop(margins)}>
                  Reset
                </Button>
                <p aria-live="polite" className="text-sm text-[color:var(--text-muted)]">
                  {trimming ??
                    trimNote ??
                    (scope === "current"
                      ? croppedPages
                        ? `${plural(croppedPages, "page", "pages")} cropped. Other pages stay as they are.`
                        : "Crop this page; other pages stay as they are."
                      : "One crop for every page.")}
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Button size="sm" icon={ChevronLeft} onClick={() => setPageIndex((i) => i - 1)} disabled={pageIndex === 0} aria-label="Previous page" />
                    <span className="text-sm tabular-nums">
                      Page {pageIndex + 1} of {pageCount}
                    </span>
                    <Button size="sm" icon={ChevronRight} onClick={() => setPageIndex((i) => i + 1)} disabled={pageIndex === pageCount - 1} aria-label="Next page" />
                  </div>
                  <div className="flex justify-center rounded bg-[color:var(--surface)] p-4">
                    {view?.index === pageIndex ? (
                      <div ref={frame} className="relative select-none shadow" style={{ touchAction: "none" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing for next/image to optimise */}
                        <img src={view.url} alt={`Page ${pageIndex + 1}`} draggable={false} className="block max-h-[70vh] w-auto" />
                        {/* Dims what's cropped off, as four strips, so handles on the page's edge aren't clipped. */}
                        {[
                          { left: 0, right: 0, top: 0, height: `${margins.top * 100}%` },
                          { left: 0, right: 0, bottom: 0, height: `${margins.bottom * 100}%` },
                          { left: 0, top: `${margins.top * 100}%`, bottom: `${margins.bottom * 100}%`, width: `${margins.left * 100}%` },
                          { right: 0, top: `${margins.top * 100}%`, bottom: `${margins.bottom * 100}%`, width: `${margins.right * 100}%` },
                        ].map((style, i) => (
                          <div key={i} aria-hidden className="pointer-events-none absolute bg-black/55" style={style} />
                        ))}
                        <div
                          role="group"
                          tabIndex={0}
                          aria-label={`Crop box. Arrow keys move it${keptMm ? `; it keeps ${keptMm[0]} × ${keptMm[1]} mm` : ""}.`}
                          onPointerDown={(e) => onGripDown("move", e)}
                          onPointerMove={onGripMove}
                          onPointerUp={() => (drag.current = null)}
                          onKeyDown={onBoxKey}
                          className="absolute cursor-move outline outline-2 outline-[color:var(--accent)] focus-visible:outline-4"
                          style={{
                            left: `${margins.left * 100}%`,
                            top: `${margins.top * 100}%`,
                            right: `${margins.right * 100}%`,
                            bottom: `${margins.bottom * 100}%`,
                          }}
                        >
                          {GRIPS.map((g) => (
                            <span
                              key={g.id}
                              aria-hidden
                              onPointerDown={(e) => onGripDown(g.id, e)}
                              onPointerMove={onGripMove}
                              onPointerUp={() => (drag.current = null)}
                              className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-[color:var(--accent)] bg-white"
                              style={{ ...g.style, cursor: g.cursor }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="py-24 text-sm text-[color:var(--text-muted)]">Drawing page…</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm">Cut from each side (mm)</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(["top", "bottom", "left", "right"] as const).map((side) => (
                      <label key={side} className="space-y-1 text-sm capitalize">
                        <span className="block text-[color:var(--text-muted)]">{side}</span>
                        <input
                          type="number"
                          min={0}
                          value={view ? mm(margins[side], side === "left" || side === "right" ? view.width : view.height) : 0}
                          onChange={(e) => setSideMm(side, Number(e.target.value))}
                          disabled={!view}
                          className="w-full rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1.5 tabular-nums focus:border-[color:var(--accent)] focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>
                  {keptMm && view && (
                    <p className="text-sm text-[color:var(--text-muted)]">
                      Page {Math.round(view.width * MM_PER_PT)} × {Math.round(view.height * MM_PER_PT)} mm, cropped to{" "}
                      <span className="text-[color:var(--text)]">
                        {keptMm[0]} × {keptMm[1]} mm
                      </span>
                      .
                    </p>
                  )}
                  <p className="text-xs text-[color:var(--text-muted)]">
                    Drag the box or its handles. Cropping hides what&apos;s outside the box; to delete content for good, use Redact PDF.
                  </p>
                  <Button variant="primary" icon={Crop} onClick={start} disabled={!crops.length || job.status === "working"} className="w-full">
                    {scope === "all" ? "Crop all pages" : crops.length ? `Crop ${plural(crops.length, "page", "pages")}` : "Crop page"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </InputPanel>

      <OutputPanel
        label="Cropped PDF"
        wide
        copyable={false}
        download={job.status === "done" ? { filename: outName, mimeType: "application/pdf", content: job.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className="text-[color:var(--text-muted)]">{file ? "Set the crop, then press Crop." : "Choose a PDF."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label="Cropping…"
              onCancel={() => {
                cancelJob.current();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't crop this PDF">{job.error}</Alert>
          ) : (
            <div className="space-y-1">
              <p className="text-base">
                Cropped <span className="font-semibold">{plural(job.pages, "page", "pages")}</span>
                <span className="text-[color:var(--text-muted)]"> · {formatBytes(job.bytes.length)}</span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">Downloaded as {outName}. Use Download above to save it again.</p>
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

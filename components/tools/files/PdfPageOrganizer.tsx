"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, RotateCw, Save, Trash2, Undo2 } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import FileDrop from "@/components/ui/FileDrop";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import type { PageEdit } from "@/lib/tools/files/pdf-organize";
import type { PdfOrganizeRequest } from "@/lib/tools/files/pdf-organize.worker";
import { openPdfRenderer } from "@/lib/tools/files/pdf-render";
import { runWorkerTask } from "@/lib/worker-task";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-organize.worker.ts", import.meta.url));
}

/** Longest side of a preview, in CSS pixels. */
const THUMB_SIZE = 160;

interface Page {
  /** Zero-based page in the original file; also the row's stable key. */
  index: number;
  /** Clockwise quarter turns added by the user. */
  turns: number;
  deleted: boolean;
}

type Doc = { status: "none" } | { status: "opening" } | { status: "ready" } | { status: "error"; error: string };
type SaveState = { status: "idle" } | { status: "working" } | { status: "done"; bytes: Uint8Array } | { status: "error"; error: string };

const initialPages = (count: number): Page[] => Array.from({ length: count }, (_, index) => ({ index, turns: 0, deleted: false }));
const isUnchanged = (pages: Page[]) => pages.every((p, i) => p.index === i && p.turns % 4 === 0 && !p.deleted);

const iconButton =
  "rounded p-1.5 text-[color:var(--text-muted)] hover:bg-[color:var(--surface)] hover:text-[color:var(--text)] disabled:opacity-30 disabled:hover:bg-transparent";

export default function PdfPageOrganizer() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc>({ status: "none" });
  const [pages, setPages] = useState<Page[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const cancelSave = useRef(() => {});

  // Open the file twice in the background: pdf-lib checks it can be edited, pdf.js draws the previews.
  useEffect(() => {
    setPages([]);
    setThumbs({});
    if (!file) return setDoc({ status: "none" });
    if (file.size > PDF_MAX_BYTES) return setDoc({ status: "error", error: `This file is over ${formatBytes(PDF_MAX_BYTES)}, too big to process in the browser.` });

    let cancelled = false;
    let cancelCount = () => {};
    let destroyThumbs = () => {};
    const urls: string[] = [];
    setDoc({ status: "opening" });

    file
      .arrayBuffer()
      .then(async (buffer) => {
        if (cancelled) return;
        const bytes = new Uint8Array(buffer);
        const task = runWorkerTask<PdfOrganizeRequest, never, number>(createWorker, { kind: "count", bytes: buffer.slice(0) });
        cancelCount = task.cancel;
        const count = await task.result;
        if (cancelled) return;
        setPages(initialPages(count));
        setDoc({ status: "ready" });

        // Previews are a nicety: if pdf.js can't draw a page, its card shows the page number instead.
        // shortcut: renders every page in order up front; render only visible cards if 500+ page files feel slow.
        try {
          const thumbnails = await openPdfRenderer(bytes);
          destroyThumbs = thumbnails.destroy;
          for (let i = 0; i < thumbnails.pageCount && !cancelled; i++) {
            const blob = await thumbnails.thumbnail(i, THUMB_SIZE).catch(() => null);
            if (!blob || cancelled) continue;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            setThumbs((prev) => ({ ...prev, [i]: url }));
          }
        } catch {
          // Leave the numbered placeholders.
        }
      })
      .catch((err: Error) => !cancelled && err.message !== "cancelled" && setDoc({ status: "error", error: pdfErrorMessage(err.message) }));

    return () => {
      cancelled = true;
      cancelCount();
      destroyThumbs();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [file]);

  // Any edit makes an earlier saved file out of date.
  useEffect(() => {
    cancelSave.current();
    setSave({ status: "idle" });
  }, [file, pages]);

  useEffect(() => () => cancelSave.current(), []);

  const change = (position: number, patch: Partial<Page>) => setPages((list) => list.map((p, i) => (i === position ? { ...p, ...patch } : p)));

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= pages.length) return;
    setPages((list) => {
      const next = [...list];
      const [page] = next.splice(from, 1);
      next.splice(to, 0, page);
      return next;
    });
  }

  function onDrop(e: DragEvent, position: number) {
    e.preventDefault();
    if (dragging !== null) move(dragging, position);
    setDragging(null);
    setDropTarget(null);
  }

  async function start() {
    if (!file) return;
    const edits: PageEdit[] = pages.filter((p) => !p.deleted).map(({ index, turns }) => ({ index, turns }));
    setSave({ status: "working" });
    try {
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfOrganizeRequest, never, Uint8Array>(createWorker, { kind: "organize", bytes, edits }, { transfer: [bytes] });
      cancelSave.current = task.cancel;
      setSave({ status: "done", bytes: await task.result });
    } catch (err) {
      if ((err as Error).message !== "cancelled") setSave({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  const kept = pages.filter((p) => !p.deleted).length;
  const deleted = pages.length - kept;
  const unchanged = isUnchanged(pages);
  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-organized.pdf") : "organized.pdf";

  return (
    <>
      <InputPanel label="Pages" wide>
        <div className="space-y-4">
          {file ? (
            <SelectedFile
              file={file}
              onClear={() => setFile(null)}
              detail={doc.status === "ready" ? plural(pages.length, "page", "pages") : doc.status === "opening" ? "opening…" : undefined}
            />
          ) : (
            <FileDrop onFiles={([f]) => setFile(f)} accept="application/pdf,.pdf" what="a PDF" />
          )}

          {doc.status === "error" && <Alert title="Couldn't open this PDF">{doc.error}</Alert>}

          {doc.status === "ready" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" icon={RotateCcw} onClick={() => setPages((list) => list.map((p) => ({ ...p, turns: p.turns - 1 })))}>
                  Rotate all left
                </Button>
                <Button size="sm" icon={RotateCw} onClick={() => setPages((list) => list.map((p) => ({ ...p, turns: p.turns + 1 })))}>
                  Rotate all right
                </Button>
                <Button size="sm" icon={Undo2} onClick={() => setPages(initialPages(pages.length))} disabled={unchanged}>
                  Reset
                </Button>
                <p className="ml-auto font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                  {plural(kept, "page", "pages")}
                  {deleted > 0 && `, ${deleted} deleted`}. Drag pages or use the arrows to reorder.
                </p>
              </div>

              <ol className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {pages.map((page, position) => {
                  const label = `page ${page.index + 1}`;
                  return (
                    <li
                      key={page.index}
                      draggable
                      onDragStart={(e) => {
                        setDragging(position);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropTarget(position);
                      }}
                      onDragLeave={() => setDropTarget((t) => (t === position ? null : t))}
                      onDrop={(e) => onDrop(e, position)}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      className={`flex cursor-grab flex-col rounded-md border p-2 active:cursor-grabbing ${
                        dropTarget === position && dragging !== position ? "border-[color:var(--accent)]" : "border-[color:var(--border)]"
                      } ${dragging === position ? "opacity-50" : ""}`}
                    >
                      <div className={`relative flex aspect-square items-center justify-center overflow-hidden rounded bg-[color:var(--surface)] ${page.deleted ? "opacity-30" : ""}`}>
                        {thumbs[page.index] ? (
                          // A square box holds any page at any quarter turn, so rotating never overflows it.
                          // eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing for next/image to optimise
                          <img
                            src={thumbs[page.index]}
                            alt={`Preview of ${label}`}
                            draggable={false}
                            className="max-h-full max-w-full shadow-sm transition-transform"
                            style={{ transform: `rotate(${page.turns * 90}deg)` }}
                          />
                        ) : (
                          <span className="font-[family-name:var(--font-ui)] text-2xl text-[color:var(--text-muted)]">{page.index + 1}</span>
                        )}
                        {page.deleted && (
                          <span className="absolute inset-x-0 bottom-2 text-center font-[family-name:var(--font-ui)] text-xs font-medium text-[color:var(--error)]">
                            Deleted
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 font-[family-name:var(--font-ui)] text-xs">
                        <span className="tabular-nums">{position + 1}</span>
                        {page.index !== position && <span className="text-[color:var(--text-muted)]"> · was {page.index + 1}</span>}
                      </p>

                      <div className="mt-1 flex items-center justify-between" role="group" aria-label={`Actions for ${label}`}>
                        <button type="button" className={iconButton} onClick={() => move(position, position - 1)} disabled={position === 0} aria-label={`Move ${label} earlier`}>
                          <ArrowLeft aria-hidden className="h-4 w-4" />
                        </button>
                        <button type="button" className={iconButton} onClick={() => change(position, { turns: page.turns - 1 })} disabled={page.deleted} aria-label={`Rotate ${label} left`}>
                          <RotateCcw aria-hidden className="h-4 w-4" />
                        </button>
                        <button type="button" className={iconButton} onClick={() => change(position, { turns: page.turns + 1 })} disabled={page.deleted} aria-label={`Rotate ${label} right`}>
                          <RotateCw aria-hidden className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={`${iconButton} ${page.deleted ? "" : "hover:text-[color:var(--error)]"}`}
                          onClick={() => change(position, { deleted: !page.deleted })}
                          aria-label={page.deleted ? `Restore ${label}` : `Delete ${label}`}
                        >
                          {page.deleted ? <Undo2 aria-hidden className="h-4 w-4" /> : <Trash2 aria-hidden className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          className={iconButton}
                          onClick={() => move(position, position + 1)}
                          disabled={position === pages.length - 1}
                          aria-label={`Move ${label} later`}
                        >
                          <ArrowRight aria-hidden className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" icon={Save} onClick={start} disabled={kept === 0 || unchanged || save.status === "working"}>
                  Save PDF
                </Button>
                <p className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                  {kept === 0 ? "Restore at least one page to save." : unchanged ? "Move, rotate or delete a page to save a new PDF." : ""}
                </p>
              </div>
            </>
          )}
        </div>
      </InputPanel>

      <OutputPanel
        label="Organized PDF"
        wide
        copyable={false}
        download={save.status === "done" ? { filename: outName, mimeType: "application/pdf", content: save.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={save.status === "working"}>
          {save.status === "idle" ? (
            <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">
              {file ? "Arrange the pages, then save." : "Choose a PDF to arrange its pages."}
            </p>
          ) : save.status === "working" ? (
            <TaskProgress
              label="Saving…"
              onCancel={() => {
                cancelSave.current();
                setSave({ status: "idle" });
              }}
            />
          ) : save.status === "error" ? (
            <Alert title="Couldn't save this PDF">{save.error}</Alert>
          ) : (
            <p className="font-[family-name:var(--font-ui)] text-base">
              <span className="font-semibold">{plural(kept, "page", "pages")}</span>
              <span className="text-[color:var(--text-muted)]"> · {formatBytes(save.bytes.length)} · {outName}</span>
            </p>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

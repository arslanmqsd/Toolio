"use client";

import { useEffect, useRef, useState } from "react";
import { FileArchive, RotateCcw, RotateCw, X } from "lucide-react";
import { DownloadButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import FileDrop from "@/components/ui/FileDrop";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { saveFile } from "@/lib/save-file";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import { turnsToDegrees } from "@/lib/tools/files/pdf-organize";
import type { PdfOrganizeRequest } from "@/lib/tools/files/pdf-organize.worker";
import { openPdfRenderer } from "@/lib/tools/files/pdf-render";
import { runWorkerTask } from "@/lib/worker-task";
import { uniqueNames, zipStore } from "@/lib/zip";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-organize.worker.ts", import.meta.url));
}

/** Longest side of a first-page preview, in CSS pixels. */
const THUMB_SIZE = 72;

interface Item {
  id: number;
  file: File;
  /** Null while the file is still being opened. */
  pages: number | null;
  error: string | null;
  /** Object URL of the first page, once drawn. */
  thumb: string | null;
  /** Clockwise quarter turns chosen for this file. */
  turns: number;
}

interface Output {
  id: number;
  name: string;
  blob: Blob;
}

type Job = { status: "idle" } | { status: "working"; done: number; total: number } | { status: "done"; outputs: Output[] } | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";
const iconButton =
  "rounded p-1.5 text-[color:var(--text-muted)] hover:bg-[color:var(--surface)] hover:text-[color:var(--text)] disabled:opacity-30 disabled:hover:bg-transparent";

/** "Turned right", "Upside down", "Turned left", or "Not turned". */
function turnLabel(turns: number): string {
  return ["Not turned", "Turned right", "Upside down", "Turned left"][turnsToDegrees(turns) / 90];
}

export default function RotatePdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [job, setJob] = useState<Job>({ status: "idle" });
  const nextId = useRef(0);
  const cancels = useRef(new Map<number | "job", () => void>());
  const urls = useRef(new Set<string>());

  // Stop every worker and free every preview when leaving the page.
  useEffect(() => {
    const running = cancels.current;
    const live = urls.current;
    return () => {
      running.forEach((cancel) => cancel());
      live.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Any change makes earlier results out of date.
  useEffect(() => {
    cancels.current.get("job")?.();
    setJob({ status: "idle" });
  }, [items]);

  const update = (id: number, patch: Partial<Item>) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const turnAll = (by: number) => setItems((list) => list.map((item) => (item.error ? item : { ...item, turns: item.turns + by })));

  function remove(item: Item) {
    cancels.current.get(item.id)?.();
    if (item.thumb) {
      URL.revokeObjectURL(item.thumb);
      urls.current.delete(item.thumb);
    }
    setItems((list) => list.filter((i) => i.id !== item.id));
  }

  function addFiles(files: File[]) {
    const added: Item[] = files.map((file) => ({ id: nextId.current++, file, pages: null, error: null, thumb: null, turns: 0 }));
    setItems((list) => [...list, ...added]);
    for (const { id, file } of added) {
      if (file.size > PDF_MAX_BYTES) {
        update(id, { error: `Over ${formatBytes(PDF_MAX_BYTES)}, too big for the browser.` });
        continue;
      }
      // pdf-lib checks it can save the file; pdf.js draws the first page. The preview is optional.
      file.arrayBuffer().then(
        (buffer) => {
          const copy = buffer.slice(0);
          const task = runWorkerTask<PdfOrganizeRequest, never, number>(createWorker, { kind: "count", bytes: copy }, { transfer: [copy] });
          cancels.current.set(id, task.cancel);
          task.result
            .then((pages) => update(id, { pages }))
            .catch((err: Error) => err.message !== "cancelled" && update(id, { error: pdfErrorMessage(err.message) }))
            .finally(() => cancels.current.delete(id));
          openPdfRenderer(new Uint8Array(buffer))
            .then(async (r) => {
              const blob = await r.thumbnail(0, THUMB_SIZE).finally(() => r.destroy());
              const url = URL.createObjectURL(blob);
              urls.current.add(url);
              update(id, { thumb: url });
            })
            .catch(() => {});
        },
        () => update(id, { error: "The browser couldn't read this file." }),
      );
    }
  }

  const toRotate = items.filter((item) => turnsToDegrees(item.turns) !== 0);
  const broken = items.filter((item) => item.error).length;
  const opening = items.some((item) => item.pages === null && !item.error);
  const canRotate = toRotate.length > 0 && !broken && !opening && job.status !== "working";

  async function start() {
    const outputs: Output[] = [];
    setJob({ status: "working", done: 0, total: toRotate.length });
    try {
      for (const [n, item] of toRotate.entries()) {
        const bytes = await item.file.arrayBuffer();
        const task = runWorkerTask<PdfOrganizeRequest, never, Uint8Array>(createWorker, { kind: "rotate", bytes, turns: item.turns }, { transfer: [bytes] });
        cancels.current.set("job", task.cancel);
        const out = await task.result;
        outputs.push({ id: item.id, name: item.file.name.replace(/(\.pdf)?$/i, "-rotated.pdf"), blob: new Blob([out as Uint8Array<ArrayBuffer>], { type: "application/pdf" }) });
        setJob({ status: "working", done: n + 1, total: toRotate.length });
      }
      setJob({ status: "done", outputs });
    } catch (err) {
      if ((err as Error).message !== "cancelled") setJob({ status: "error", error: pdfErrorMessage((err as Error).message) });
    } finally {
      cancels.current.delete("job");
    }
  }

  async function downloadZip(outputs: Output[]) {
    const names = uniqueNames(outputs.map((o) => o.name));
    const entries = await Promise.all(outputs.map(async (o, i) => ({ name: names[i], data: new Uint8Array(await o.blob.arrayBuffer()) })));
    saveFile(zipStore(entries), "rotated-pdfs.zip", "application/zip");
  }

  const single = job.status === "done" && job.outputs.length === 1 ? job.outputs[0] : null;

  return (
    <>
      <InputPanel label="PDFs">
        <div className="space-y-4">
          {items.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={RotateCcw} onClick={() => turnAll(-1)}>
                Rotate all left
              </Button>
              <Button icon={RotateCw} onClick={() => turnAll(1)}>
                Rotate all right
              </Button>
            </div>
          )}

          {items.length > 0 && (
            <ul className="divide-y divide-[color:var(--border)] rounded-md border border-[color:var(--border)]">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 p-2">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-[color:var(--surface)]">
                    {item.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a local object URL; next/image can't optimise it
                      <img
                        src={item.thumb}
                        alt=""
                        className="max-h-[72px] max-w-[72px] shadow-sm transition-transform"
                        style={{ transform: `rotate(${item.turns * 90}deg)` }}
                      />
                    ) : (
                      <span className="text-xs text-[color:var(--text-muted)]">PDF</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="break-all">{item.file.name}</p>
                    <p className={`text-xs ${item.error ? "text-[color:var(--error)]" : "text-[color:var(--text-muted)]"}`}>
                      {item.error ??
                        (item.pages === null ? "Opening…" : `${plural(item.pages, "page", "pages")} · ${turnLabel(item.turns)}`)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={iconButton}
                    onClick={() => update(item.id, { turns: item.turns - 1 })}
                    disabled={Boolean(item.error)}
                    aria-label={`Rotate ${item.file.name} left`}
                  >
                    <RotateCcw aria-hidden className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={iconButton}
                    onClick={() => update(item.id, { turns: item.turns + 1 })}
                    disabled={Boolean(item.error)}
                    aria-label={`Rotate ${item.file.name} right`}
                  >
                    <RotateCw aria-hidden className="h-4 w-4" />
                  </button>
                  <button type="button" className={`${iconButton} hover:text-[color:var(--error)]`} onClick={() => remove(item)} aria-label={`Remove ${item.file.name}`}>
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <FileDrop onFiles={addFiles} accept="application/pdf,.pdf" multiple what="PDFs" compact={items.length > 0} />

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={RotateCw} onClick={start} disabled={!canRotate}>
              Rotate {toRotate.length > 1 ? `${toRotate.length} PDFs` : "PDF"}
            </Button>
            <p className={`text-xs ${muted}`}>
              {items.length === 0
                ? "Add one or more PDFs. Every page in a file turns together."
                : broken
                  ? `Remove the ${broken === 1 ? "file" : "files"} that can't be opened.`
                  : opening
                    ? "Opening files…"
                    : toRotate.length === 0
                      ? "Turn a file with its arrows, or all of them at once."
                      : toRotate.length < items.length
                        ? "Files that aren't turned are left out."
                        : ""}
            </p>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label={job.status === "done" && job.outputs.length > 1 ? "Rotated PDFs" : "Rotated PDF"}
        copyable={false}
        download={single ? { filename: single.name, mimeType: "application/pdf", content: single.blob } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className={muted}>{items.length ? "Turn the files you need, then rotate." : "Add PDFs to rotate."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label={`Rotating file ${Math.min(job.done + 1, job.total)} of ${job.total}…`}
              value={job.done / job.total}
              onCancel={() => {
                cancels.current.get("job")?.();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't rotate these PDFs">{job.error}</Alert>
          ) : single ? (
            <div className="space-y-1 font-[family-name:var(--font-ui)]">
              <p className="text-base">
                <span className="font-semibold">Rotated</span>
                <span className="text-[color:var(--text-muted)]"> · {formatBytes(single.blob.size)}</span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">{single.name}</p>
            </div>
          ) : (
            <div className="space-y-3 font-[family-name:var(--font-ui)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold">{plural(job.outputs.length, "PDF", "PDFs")} rotated</p>
                <Button icon={FileArchive} onClick={() => downloadZip(job.outputs)}>
                  Download all (ZIP)
                </Button>
              </div>
              <ul className="divide-y divide-[color:var(--border)]">
                {job.outputs.map((out) => (
                  <li key={out.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 break-all text-sm">
                      {out.name}
                      <span className="block text-xs text-[color:var(--text-muted)]">{formatBytes(out.blob.size)}</span>
                    </span>
                    <DownloadButton content={out.blob} filename={out.name} mimeType="application/pdf" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

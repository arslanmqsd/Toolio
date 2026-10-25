"use client";

import { useEffect, useRef, useState } from "react";
import { Combine } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import FileDrop from "@/components/ui/FileDrop";
import ReorderList from "@/components/ui/ReorderList";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import type { MergeProgress } from "@/lib/tools/files/pdf-merge";
import type { PdfMergeRequest } from "@/lib/tools/files/pdf-merge.worker";
import { runWorkerTask } from "@/lib/worker-task";


function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-merge.worker.ts", import.meta.url));
}

interface Item {
  id: number;
  file: File;
  /** Null while the file is still being opened. */
  pages: number | null;
  error: string | null;
}

type MergeState =
  | { status: "idle" }
  | { status: "working"; progress: MergeProgress }
  | { status: "done"; bytes: Uint8Array; pages: number; files: number }
  | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

function progressLabel(progress: MergeProgress): string {
  return progress.phase === "saving" ? "Saving…" : `Adding file ${progress.done + 1} of ${progress.total}…`;
}

export default function PdfMerger() {
  const [items, setItems] = useState<Item[]>([]);
  const [merge, setMerge] = useState<MergeState>({ status: "idle" });
  const nextId = useRef(0);
  const cancels = useRef(new Map<number | "merge", () => void>());

  // Stop every worker still running when leaving the page.
  useEffect(() => {
    const running = cancels.current;
    return () => running.forEach((cancel) => cancel());
  }, []);

  const update = (id: number, patch: Partial<Item>) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  function stopMerge() {
    cancels.current.get("merge")?.();
    cancels.current.delete("merge");
  }

  /** Any change to the list makes an earlier merge out of date. */
  function changeItems(next: Item[]) {
    stopMerge();
    setMerge({ status: "idle" });
    for (const id of cancels.current.keys()) {
      if (id !== "merge" && !next.some((item) => item.id === id)) cancels.current.get(id)?.();
    }
    setItems(next);
  }

  function addFiles(files: File[]) {
    const added = files.map((file) => ({ id: nextId.current++, file, pages: null, error: null }));
    changeItems([...items, ...added]);
    // Open each file in the background to count its pages and catch damaged or locked ones early.
    for (const { id, file } of added) {
      file.arrayBuffer().then(
        (bytes) => {
          const task = runWorkerTask<PdfMergeRequest, never, number>(createWorker, { kind: "count", bytes }, { transfer: [bytes] });
          cancels.current.set(id, task.cancel);
          task.result
            .then((pages) => update(id, { pages }))
            .catch((err: Error) => err.message !== "cancelled" && update(id, { error: pdfErrorMessage(err.message) }))
            .finally(() => cancels.current.delete(id));
        },
        () => update(id, { error: "The browser couldn't read this file." }),
      );
    }
  }

  async function start() {
    stopMerge();
    setMerge({ status: "working", progress: { phase: "adding", done: 0, total: items.length } });
    try {
      const files = await Promise.all(items.map((item) => item.file.arrayBuffer()));
      const task = runWorkerTask<PdfMergeRequest, MergeProgress, Uint8Array>(createWorker, { kind: "merge", files }, {
        transfer: files,
        onProgress: (progress) => setMerge({ status: "working", progress }),
      });
      cancels.current.set("merge", task.cancel);
      const bytes = await task.result;
      setMerge({ status: "done", bytes, pages: items.reduce((sum, item) => sum + (item.pages ?? 0), 0), files: items.length });
    } catch (err) {
      if ((err as Error).message !== "cancelled") setMerge({ status: "error", error: pdfErrorMessage((err as Error).message) });
    } finally {
      cancels.current.delete("merge");
    }
  }

  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const tooBig = totalBytes > PDF_MAX_BYTES;
  const broken = items.filter((item) => item.error).length;
  const opening = items.some((item) => item.pages === null && !item.error);
  const canMerge = items.length >= 2 && !tooBig && !broken && !opening && merge.status !== "working";

  return (
    <>
      <InputPanel label="PDFs">
        <div className="space-y-4">
          {items.length > 0 && (
            <ReorderList
              items={items}
              getKey={(item) => String(item.id)}
              getName={(item) => item.file.name}
              onChange={changeItems}
              renderItem={(item, i) => (
                <div className="py-1">
                  <p className="break-all">
                    <span className="mr-2 tabular-nums text-[color:var(--text-muted)]">{i + 1}.</span>
                    {item.file.name}
                  </p>
                  <p className={`text-xs ${item.error ? "text-[color:var(--error)]" : "text-[color:var(--text-muted)]"}`}>
                    {formatBytes(item.file.size)}
                    {" · "}
                    {item.error ?? (item.pages === null ? "Opening…" : plural(item.pages, "page", "pages"))}
                  </p>
                </div>
              )}
            />
          )}

          <FileDrop onFiles={addFiles} accept="application/pdf,.pdf" multiple what="PDFs" compact={items.length > 0} />

          {tooBig && (
            <Alert title="Too much to merge in the browser">
              These files add up to {formatBytes(totalBytes)}. Keep the total under {formatBytes(PDF_MAX_BYTES)}.
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={Combine} onClick={start} disabled={!canMerge}>
              Merge PDFs
            </Button>
            <p className={`text-xs ${muted}`}>
              {items.length < 2
                ? "Add at least two PDFs. Use the arrows to set the order."
                : broken
                  ? `Remove the ${broken === 1 ? "file" : "files"} that can't be opened to merge.`
                  : opening
                    ? "Opening files…"
                    : `${plural(items.length, "file", "files")}, ${formatBytes(totalBytes)} in total.`}
            </p>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label="Merged PDF"
        copyable={false}
        download={merge.status === "done" ? { filename: "merged.pdf", mimeType: "application/pdf", content: merge.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={merge.status === "working"}>
          {merge.status === "idle" ? (
            <p className={muted}>Add PDFs, put them in order, then merge.</p>
          ) : merge.status === "working" ? (
            <TaskProgress
              label={progressLabel(merge.progress)}
              value={merge.progress.phase === "adding" ? merge.progress.done / merge.progress.total : undefined}
              onCancel={() => {
                stopMerge();
                setMerge({ status: "idle" });
              }}
            />
          ) : merge.status === "error" ? (
            <Alert title="Couldn't merge these PDFs">{merge.error}</Alert>
          ) : (
            <div className="space-y-2 font-[family-name:var(--font-ui)]">
              <p className="text-base">
                <span className="font-semibold">{plural(merge.pages, "page", "pages")}</span> from {plural(merge.files, "file", "files")}
              </p>
              <p className="text-sm tabular-nums text-[color:var(--text-muted)]">{formatBytes(merge.bytes.length)}</p>
              <p className="text-xs text-[color:var(--text-muted)]">Bookmarks and fillable form fields from the originals aren&apos;t kept.</p>
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

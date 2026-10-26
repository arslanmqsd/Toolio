"use client";

import { useEffect, useRef, useState } from "react";
import { FileOutput } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import ReorderList from "@/components/ui/ReorderList";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { PDF_MAX_BYTES } from "@/lib/tools/files/pdf-errors";
import type { ImagesProgress, PageSize } from "@/lib/tools/files/images-to-pdf";
import type { ImagesToPdfRequest } from "@/lib/tools/files/images-to-pdf.worker";
import { imageSize, prepareImage, type PreparedImage } from "@/lib/tools/files/prepare-image";
import { runWorkerTask } from "@/lib/worker-task";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/images-to-pdf.worker.ts", import.meta.url));
}

const SIZES: { id: PageSize; label: string }[] = [
  { id: "image", label: "Same as image" },
  { id: "a4", label: "A4" },
  { id: "letter", label: "US Letter" },
];

const SIZE_HELP: Record<PageSize, string> = {
  image: "Each page is the size of its image.",
  a4: "Images are scaled to fit, and pages turn sideways for wide images.",
  letter: "Images are scaled to fit, and pages turn sideways for wide images.",
};

/** In points: none, about 6 mm, about 13 mm. */
const MARGINS = [
  { id: "0", label: "None" },
  { id: "18", label: "Small" },
  { id: "36", label: "Large" },
] as const;

type Margin = (typeof MARGINS)[number]["id"];

interface Item {
  id: number;
  file: File;
  /** Object URL for the row's preview. */
  url: string;
  /** Null while the image is being checked. */
  size: { width: number; height: number } | null;
  error: string | null;
}

type Progress = { phase: "preparing"; done: number; total: number } | ImagesProgress;

type Job = { status: "idle" } | { status: "working"; progress: Progress } | { status: "done"; bytes: Uint8Array; pages: number } | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

function progressLabel(progress: Progress): string {
  if (progress.phase === "saving") return "Saving…";
  return `${progress.phase === "preparing" ? "Reading" : "Adding"} image ${progress.done + 1} of ${progress.total}…`;
}

const errorMessage = (message: string) =>
  message === "out of memory" ? "The browser ran out of memory. Try fewer or smaller images." : "One of the images couldn't be read. Remove it and try again.";

export default function ImagesToPdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [size, setSize] = useState<PageSize>("image");
  const [margin, setMargin] = useState<Margin>("0");
  const [job, setJob] = useState<Job>({ status: "idle" });
  const nextId = useRef(0);
  /** Bumped to stop a running conversion; each run checks it still owns the latest number. */
  const run = useRef(0);
  const cancelTask = useRef(() => {});
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(
    () => () => {
      run.current++;
      cancelTask.current();
    },
    [],
  );

  // Any change makes an earlier PDF out of date.
  useEffect(() => {
    run.current++;
    cancelTask.current();
    setJob({ status: "idle" });
  }, [items, size, margin]);

  const update = (id: number, patch: Partial<Item>) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  function changeItems(next: Item[]) {
    for (const item of items) {
      if (!next.includes(item)) {
        URL.revokeObjectURL(item.url);
        urls.current.delete(item.url);
      }
    }
    setItems(next);
  }

  function addFiles(files: File[]) {
    const added = files.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return { id: nextId.current++, file, url, size: null, error: null };
    });
    setItems((list) => [...list, ...added]);
    // Decode each one now so unreadable files show up before converting.
    for (const { id, file } of added) {
      imageSize(file).then(
        (s) => update(id, { size: s }),
        () => update(id, { error: "This browser can't read this image." }),
      );
    }
  }

  async function start() {
    const id = ++run.current;
    const total = items.length;
    const images: PreparedImage[] = [];
    try {
      for (const [i, item] of items.entries()) {
        setJob({ status: "working", progress: { phase: "preparing", done: i, total } });
        images.push(await prepareImage(item.file));
        if (run.current !== id) return;
      }
      const task = runWorkerTask<ImagesToPdfRequest, ImagesProgress, Uint8Array>(
        createWorker,
        { images, options: { size, margin: Number(margin) } },
        { transfer: images.map((image) => image.bytes), onProgress: (progress) => run.current === id && setJob({ status: "working", progress }) },
      );
      cancelTask.current = task.cancel;
      const bytes = await task.result;
      if (run.current === id) setJob({ status: "done", bytes, pages: total });
    } catch (err) {
      if (run.current === id && (err as Error).message !== "cancelled") setJob({ status: "error", error: errorMessage((err as Error).message) });
    }
  }

  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const tooBig = totalBytes > PDF_MAX_BYTES;
  const broken = items.filter((item) => item.error).length;
  const checking = items.some((item) => !item.size && !item.error);
  const canConvert = items.length > 0 && !tooBig && !broken && !checking && job.status !== "working";
  const outName = items.length === 1 ? items[0].file.name.replace(/\.[^.]+$/, "") + ".pdf" : "images.pdf";

  return (
    <>
      <InputPanel label="Images">
        <div className="space-y-5">
          {items.length > 0 && (
            <ReorderList
              items={items}
              getKey={(item) => String(item.id)}
              getName={(item) => item.file.name}
              onChange={changeItems}
              renderItem={(item, i) => (
                <div className="flex items-center gap-3 py-1">
                  <span className="w-6 shrink-0 text-right tabular-nums text-[color:var(--text-muted)]">{i + 1}.</span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL; next/image can't optimise it */}
                  <img src={item.url} alt="" className="h-10 w-10 shrink-0 rounded bg-[color:var(--surface)] object-contain" />
                  <div className="min-w-0">
                    <p className="break-all">{item.file.name}</p>
                    <p className={`text-xs ${item.error ? "text-[color:var(--error)]" : "text-[color:var(--text-muted)]"}`}>
                      {formatBytes(item.file.size)}
                      {" · "}
                      {item.error ?? (item.size ? `${item.size.width} × ${item.size.height}` : "Checking…")}
                    </p>
                  </div>
                </div>
              )}
            />
          )}

          <FileDrop onFiles={addFiles} accept="image/*" multiple what="images" compact={items.length > 0} />

          {tooBig && (
            <Alert title="Too much for the browser">
              These images add up to {formatBytes(totalBytes)}. Keep the total under {formatBytes(PDF_MAX_BYTES)}.
            </Alert>
          )}

          <Field label="Page size" help={SIZE_HELP[size]}>
            <SegmentedControl label="Page size" options={SIZES} value={size} onChange={setSize} />
          </Field>

          <Field label="Margin">
            <SegmentedControl label="Margin" options={MARGINS} value={margin} onChange={setMargin} />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={FileOutput} onClick={start} disabled={!canConvert}>
              Make PDF
            </Button>
            <p className={`text-xs ${muted}`}>
              {items.length === 0
                ? "JPG, PNG, WebP, GIF and other images. Use the arrows to set the order."
                : broken
                  ? `Remove the ${broken === 1 ? "image" : "images"} that can't be read.`
                  : checking
                    ? "Checking images…"
                    : `${plural(items.length, "image", "images")}, ${formatBytes(totalBytes)} in total.`}
            </p>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label="PDF"
        copyable={false}
        download={job.status === "done" ? { filename: outName, mimeType: "application/pdf", content: job.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className={muted}>{items.length ? "Set the order and page size, then make the PDF." : "Add images to turn into a PDF, one page each."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label={progressLabel(job.progress)}
              value={job.progress.phase === "saving" ? undefined : job.progress.done / job.progress.total}
              onCancel={() => {
                run.current++;
                cancelTask.current();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't make the PDF">{job.error}</Alert>
          ) : (
            <div className="space-y-1 font-[family-name:var(--font-ui)]">
              <p className="text-base">
                <span className="font-semibold">{plural(job.pages, "page", "pages")}</span>
                <span className="text-[color:var(--text-muted)]"> · {formatBytes(job.bytes.length)}</span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">{outName}</p>
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

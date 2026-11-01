"use client";

import { useEffect, useState } from "react";
import { formatBytes } from "@/lib/format-bytes";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import type { PdfOrganizeRequest } from "@/lib/tools/files/pdf-organize.worker";
import { openPdfRenderer, type PdfRenderer } from "@/lib/tools/files/pdf-render";
import { runWorkerTask } from "@/lib/worker-task";

export function createOrganizeWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-organize.worker.ts", import.meta.url));
}

export type PdfPagesDoc = { status: "none" } | { status: "opening" } | { status: "ready"; pages: number } | { status: "error"; error: string };

/**
 * Opens a PDF for a page grid: pdf-lib counts the pages (and checks the file can be edited), then pdf.js
 * draws a preview of each, longest side `thumbSize` CSS pixels. `renderer` stays open for bigger views.
 */
export function usePdfPages(file: File | null, thumbSize: number) {
  const [doc, setDoc] = useState<PdfPagesDoc>({ status: "none" });
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [renderer, setRenderer] = useState<PdfRenderer | null>(null);

  useEffect(() => {
    setThumbs({});
    setRenderer(null);
    if (!file) return setDoc({ status: "none" });
    if (file.size > PDF_MAX_BYTES) return setDoc({ status: "error", error: `This file is over ${formatBytes(PDF_MAX_BYTES)}, too big to process in the browser.` });

    let cancelled = false;
    let cancelCount = () => {};
    let destroyRenderer = () => {};
    const urls: string[] = [];
    setDoc({ status: "opening" });

    file
      .arrayBuffer()
      .then(async (buffer) => {
        if (cancelled) return;
        const task = runWorkerTask<PdfOrganizeRequest, never, number>(createOrganizeWorker, { kind: "count", bytes: buffer.slice(0) });
        cancelCount = task.cancel;
        const count = await task.result;
        if (cancelled) return;
        setDoc({ status: "ready", pages: count });

        // Previews are a nicety: if pdf.js can't draw a page, its card shows the page number instead.
        // shortcut: renders every page in order up front; render only visible cards if 500+ page files feel slow.
        try {
          const opened = await openPdfRenderer(new Uint8Array(buffer));
          destroyRenderer = opened.destroy;
          if (cancelled) return opened.destroy();
          setRenderer(opened);
          for (let i = 0; i < opened.pageCount && !cancelled; i++) {
            const blob = await opened.thumbnail(i, thumbSize).catch(() => null);
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
      destroyRenderer();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [file, thumbSize]);

  return { doc, thumbs, renderer };
}

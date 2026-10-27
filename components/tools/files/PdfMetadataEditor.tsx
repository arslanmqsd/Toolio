"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Save, Undo2 } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import TextInput from "@/components/ui/TextInput";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import {
  EMPTY_METADATA,
  TEXT_FIELDS,
  changedFields,
  fromDateTimeLocal,
  toDateTimeLocal,
  type PdfMetadata,
  type ReadMetadata,
  type TextField,
} from "@/lib/tools/files/pdf-metadata";
import type { PdfMetadataRequest } from "@/lib/tools/files/pdf-metadata.worker";
import { runWorkerTask } from "@/lib/worker-task";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-metadata.worker.ts", import.meta.url));
}

const LABELS: Record<keyof PdfMetadata, string> = {
  title: "Title",
  author: "Author",
  subject: "Subject",
  keywords: "Keywords",
  creator: "Created with",
  producer: "PDF made by",
  created: "Created",
  modified: "Modified",
};

const HELP: Partial<Record<keyof PdfMetadata, string>> = {
  title: "Shown in the reader's title bar and in search results instead of the file name.",
  keywords: "Separate with commas.",
  creator: "The app the document was written in, like Microsoft Word.",
  producer: "The software that turned it into a PDF.",
};

type Doc = { status: "none" } | { status: "opening" } | { status: "ready"; original: ReadMetadata } | { status: "error"; error: string };
type SaveState = { status: "idle" } | { status: "working" } | { status: "done"; bytes: Uint8Array; changed: (keyof PdfMetadata)[] } | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

export default function PdfMetadataEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc>({ status: "none" });
  const [metadata, setMetadata] = useState<PdfMetadata>(EMPTY_METADATA);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const cancelSave = useRef(() => {});

  useEffect(() => {
    setMetadata(EMPTY_METADATA);
    if (!file) return setDoc({ status: "none" });
    if (file.size > PDF_MAX_BYTES) return setDoc({ status: "error", error: `This file is over ${formatBytes(PDF_MAX_BYTES)}, too big to process in the browser.` });
    let cancelled = false;
    let cancelTask = () => {};
    setDoc({ status: "opening" });
    file
      .arrayBuffer()
      .then((bytes) => {
        if (cancelled) return;
        const task = runWorkerTask<PdfMetadataRequest, never, ReadMetadata>(createWorker, { kind: "read", bytes }, { transfer: [bytes] });
        cancelTask = task.cancel;
        return task.result.then((original) => {
          setMetadata(original.metadata);
          setDoc({ status: "ready", original });
        });
      })
      .catch((err: Error) => !cancelled && err.message !== "cancelled" && setDoc({ status: "error", error: pdfErrorMessage(err.message) }));
    return () => {
      cancelled = true;
      cancelTask();
    };
  }, [file]);

  // Any edit makes an earlier saved file out of date.
  useEffect(() => {
    cancelSave.current();
    setSave({ status: "idle" });
  }, [file, metadata]);

  useEffect(() => () => cancelSave.current(), []);

  const original = doc.status === "ready" ? doc.original : null;
  const changed = original ? changedFields(original.metadata, metadata) : [];
  const set = (patch: Partial<PdfMetadata>) => setMetadata((m) => ({ ...m, ...patch }));

  async function start() {
    if (!file || !original) return;
    setSave({ status: "working" });
    try {
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfMetadataRequest, never, Uint8Array>(createWorker, { kind: "write", bytes, metadata }, { transfer: [bytes] });
      cancelSave.current = task.cancel;
      setSave({ status: "done", bytes: await task.result, changed });
    } catch (err) {
      if ((err as Error).message !== "cancelled") setSave({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  const label = (key: keyof PdfMetadata) => (
    <>
      {LABELS[key]}
      {changed.includes(key) && <span className="ml-2 text-xs font-normal text-[color:var(--accent-warn-text)]">edited</span>}
    </>
  );

  const textField = (key: TextField) => (
    <Field key={key} label={label(key)} htmlFor={`meta-${key}`} help={HELP[key]}>
      <TextInput id={`meta-${key}`} value={metadata[key]} onChange={(e) => set({ [key]: e.target.value })} disabled={!original} autoComplete="off" />
    </Field>
  );

  const dateField = (key: "created" | "modified") => (
    <Field key={key} label={label(key)} htmlFor={`meta-${key}`}>
      <TextInput
        id={`meta-${key}`}
        type="datetime-local"
        value={toDateTimeLocal(metadata[key])}
        onChange={(e) => set({ [key]: fromDateTimeLocal(e.target.value) })}
        disabled={!original}
      />
    </Field>
  );

  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-edited.pdf") : "edited.pdf";
  const isEmpty = changedFields(EMPTY_METADATA, metadata).length === 0;

  return (
    <>
      <InputPanel label="PDF">
        <div className="space-y-5">
          {file ? (
            <SelectedFile file={file} onClear={() => setFile(null)} detail={doc.status === "opening" ? "opening…" : undefined} />
          ) : (
            <FileDrop onFiles={([f]) => setFile(f)} accept="application/pdf,.pdf" what="a PDF" />
          )}

          {doc.status === "error" && <Alert title="Couldn't open this PDF">{doc.error}</Alert>}

          {original && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">{TEXT_FIELDS.map(textField)}</div>
              <div className="grid gap-5 sm:grid-cols-2">{(["created", "modified"] as const).map(dateField)}</div>
              <p className={`text-xs ${muted}`}>Empty fields are removed from the file. Dates are in your time zone.</p>

              <div className="flex flex-wrap gap-3">
                <Button variant="primary" icon={Save} onClick={start} disabled={changed.length === 0 || save.status === "working"}>
                  Save PDF
                </Button>
                <Button icon={Undo2} onClick={() => setMetadata(original.metadata)} disabled={changed.length === 0}>
                  Undo changes
                </Button>
                <Button icon={Eraser} onClick={() => setMetadata(EMPTY_METADATA)} disabled={isEmpty}>
                  Clear all
                </Button>
              </div>
            </>
          )}
        </div>
      </InputPanel>

      <OutputPanel
        label="Edited PDF"
        copyable={false}
        download={save.status === "done" ? { filename: outName, mimeType: "application/pdf", content: save.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={save.status === "working"}>
          {save.status === "idle" ? (
            <p className={muted}>
              {!original
                ? "Choose a PDF to see and edit its title, author and other details."
                : changed.length
                  ? `${plural(changed.length, "field", "fields")} edited. Save to get the new file.`
                  : "Edit any field, then save."}
            </p>
          ) : save.status === "working" ? (
            <TaskProgress label="Saving…" onCancel={() => (cancelSave.current(), setSave({ status: "idle" }))} />
          ) : save.status === "error" ? (
            <Alert title="Couldn't save this PDF">{save.error}</Alert>
          ) : (
            <div className="space-y-2 font-[family-name:var(--font-ui)]">
              <p className="text-base">
                Updated <span className="font-semibold">{save.changed.map((key) => LABELS[key]).join(", ")}</span>
                <span className="text-[color:var(--text-muted)]"> · {formatBytes(save.bytes.length)}</span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">{outName}</p>
              {original?.hasXmp && (
                <p className="text-xs text-[color:var(--text-muted)]">
                  This file also had an XMP metadata block with the old details. It was removed so every reader shows the new ones.
                </p>
              )}
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

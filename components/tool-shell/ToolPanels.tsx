"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { DataType } from "@/registry";
import { saveFile } from "@/lib/save-file";
import { panelButtonClass } from "./panel-styles";
import SaveSnippetButton from "./SaveSnippetButton";
import SendToMenu from "./SendToMenu";

const panelClass = "flex min-w-0 flex-col rounded-[var(--panel-radius)] border border-[color:var(--border)]";
const panelHeaderClass =
  "flex items-center justify-between border-b border-[color:var(--border)] px-4 py-2 text-xs font-medium text-[color:var(--text-muted)]";

interface InputPanelProps {
  label?: string;
  /** Span every column of the tool layout, for tools whose input needs the full width. */
  wide?: boolean;
  children: ReactNode;
}

export function InputPanel({ label = "Input", wide = false, children }: InputPanelProps) {
  return (
    <section className={`${panelClass} ${wide ? "lg:col-span-full" : ""}`} aria-label={label} data-tool-input>
      <div className={panelHeaderClass}>
        <span>{label}</span>
        <SaveSnippetButton />
      </div>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

interface OutputPanelProps {
  label?: string;
  /** Text placed on the clipboard by the copy button. Omit to disable copying. */
  copyText?: string;
  /**
   * What `copyText` is right now, one of the tool's `produces`. Set it to offer "Send to" for
   * other tools that consume this type.
   */
  outputType?: DataType;
  /** Adds a button that saves this file: `content` when given (e.g. binary bytes), otherwise `copyText`. */
  download?: { filename: string; mimeType: string; content?: Uint8Array<ArrayBuffer> | Blob };
  /** Span every column of the tool layout, for wide output like a diff. */
  wide?: boolean;
  /** Called after the copy button puts `copyText` on the clipboard. */
  onCopy?: () => void;
  /** False for output that can't be text, like a PDF, so no copy button is shown at all. */
  copyable?: boolean;
  children: ReactNode;
}

export function OutputPanel({ label = "Output", copyText, outputType, download, wide = false, onCopy, copyable = true, children }: OutputPanelProps) {
  return (
    <section className={`${panelClass} ${wide ? "lg:col-span-full" : ""} font-[family-name:var(--font-output)]`} aria-label={label}>
      <div className={panelHeaderClass}>
        <span className="font-[family-name:var(--font-ui)]">{label}</span>
        <div className="flex items-center gap-2">
          {outputType && copyText && <SendToMenu value={copyText} type={outputType} />}
          {download && <DownloadButton content={download.content ?? copyText} filename={download.filename} mimeType={download.mimeType} />}
          {copyable && <CopyButton text={copyText} onCopied={onCopy} />}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-4 text-sm">{children}</div>
    </section>
  );
}

type CopyStatus = "idle" | "copied" | "failed";

/**
 * `what` names what's copied for screen readers ("Copy" + " path $.a"), for when several copy
 * buttons share a view.
 */
export function CopyButton({ text, what, onCopied }: { text?: string; what?: string; onCopied?: () => void }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      onCopied?.();
    } catch {
      setStatus("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={!text}
      className={panelButtonClass}
    >
      <span aria-live="polite">{status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : "Copy"}</span>
      {what && <span className="sr-only"> {what}</span>}
    </button>
  );
}

interface DownloadButtonProps {
  content?: string | Uint8Array<ArrayBuffer> | Blob;
  filename: string;
  mimeType: string;
}

export function DownloadButton({ content, filename, mimeType }: DownloadButtonProps) {
  const empty = !(content instanceof Blob ? content.size : content?.length);

  function save() {
    if (content && !empty) saveFile(content, filename, mimeType);
  }

  return (
    <button type="button" onClick={save} disabled={empty} className={panelButtonClass} aria-label={`Download ${filename}`}>
      Download
    </button>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { DataType } from "@/registry";
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
  /** Adds a button that saves `copyText` as this file. */
  download?: { filename: string; mimeType: string };
  /** Span every column of the tool layout, for wide output like a diff. */
  wide?: boolean;
  children: ReactNode;
}

export function OutputPanel({ label = "Output", copyText, outputType, download, wide = false, children }: OutputPanelProps) {
  return (
    <section className={`${panelClass} ${wide ? "lg:col-span-full" : ""} font-[family-name:var(--font-output)]`} aria-label={label}>
      <div className={panelHeaderClass}>
        <span className="font-[family-name:var(--font-ui)]">{label}</span>
        <div className="flex items-center gap-2">
          {outputType && copyText && <SendToMenu value={copyText} type={outputType} />}
          {download && <DownloadButton text={copyText} {...download} />}
          <CopyButton text={copyText} />
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-4 text-sm">{children}</div>
    </section>
  );
}

type CopyStatus = "idle" | "copied" | "failed";

export function CopyButton({ text }: { text?: string }) {
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
    </button>
  );
}

export function DownloadButton({ text, filename, mimeType }: { text?: string; filename: string; mimeType: string }) {
  function save() {
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    // Revoke after the click has started the download; revoking straight away can cancel it in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <button type="button" onClick={save} disabled={!text} className={panelButtonClass} aria-label={`Download ${filename}`}>
      Download
    </button>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";

const panelClass = "flex min-w-0 flex-col rounded-lg border border-[color:var(--border)]";
const panelHeaderClass =
  "flex items-center justify-between border-b border-[color:var(--border)] px-4 py-2 text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]";

interface InputPanelProps {
  label?: string;
  children: ReactNode;
}

export function InputPanel({ label = "Input", children }: InputPanelProps) {
  return (
    <section className={panelClass} aria-label={label}>
      <div className={panelHeaderClass}>
        <span>{label}</span>
      </div>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

interface OutputPanelProps {
  label?: string;
  /** Text placed on the clipboard by the copy button. Omit to disable copying. */
  copyText?: string;
  children: ReactNode;
}

export function OutputPanel({ label = "Output", copyText, children }: OutputPanelProps) {
  return (
    <section className={`${panelClass} font-[family-name:var(--font-mono)]`} aria-label={label}>
      <div className={panelHeaderClass}>
        <span className="font-[family-name:var(--font-ui)]">{label}</span>
        <CopyButton text={copyText} />
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
      className="rounded border border-[color:var(--border)] px-2 py-0.5 font-[family-name:var(--font-ui)] normal-case tracking-normal hover:text-[color:var(--text)] disabled:opacity-40"
    >
      <span aria-live="polite">{status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : "Copy"}</span>
    </button>
  );
}

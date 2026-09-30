"use client";

import { usePathname } from "next/navigation";
import { ClipboardPaste, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useWorkbench } from "@/components/workbench/context";
import { dataTypeLabels } from "@/registry";
import { useToolIO } from "./tool-io";

const PREVIEW_LENGTH = 80;

/** Offers to load something pasted elsewhere into this tool, when the tool can take its type. */
export default function WorkbenchBanner() {
  const io = useToolIO();
  const pathname = usePathname();
  const { workbench, clearWorkbench } = useWorkbench();

  const { type, value, origin } = workbench;
  const show =
    io !== null &&
    io.hasInput &&
    type !== null &&
    origin.kind === "paste" &&
    io.tool.consumes.includes(type) &&
    // A paste into one of this page's own fields is already where it belongs.
    !(origin.intoField && origin.path === pathname);

  function use() {
    io?.fill(value);
    clearWorkbench();
    // The banner unmounts with the button, so move focus to the input that now holds the value.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("[data-tool-input] textarea, [data-tool-input] input")?.focus(),
    );
  }

  const oneLine = value.trim().replace(/\s+/g, " ");
  const preview = oneLine.length > PREVIEW_LENGTH ? `${oneLine.slice(0, PREVIEW_LENGTH)}…` : oneLine;

  return (
    <div aria-live="polite" className="empty:hidden mb-4">
      {show && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] px-4 py-3">
          <ClipboardPaste aria-hidden className="h-4 w-4 shrink-0 text-[color:var(--accent-text)]" />
          <code className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-sm text-[color:var(--text-muted)]">
            {preview}
          </code>
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={use}>
              Use pasted {type && dataTypeLabels[type]}
            </Button>
            <button
              type="button"
              onClick={clearWorkbench}
              aria-label="Dismiss"
              className="rounded-md p-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

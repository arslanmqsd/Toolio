"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useWorkbench } from "@/components/workbench/context";
import { useDismiss } from "@/lib/hooks/useDismiss";
import { dataTypeLabels, sendTargets, toolHref, type DataType } from "@/registry";
import { panelButtonClass } from "./panel-styles";
import { useToolIO } from "./tool-io";

interface SendToMenuProps {
  value: string;
  type: DataType;
}

/** "Send to…" button in the output panel: opens another tool with this output as its input. */
export default function SendToMenu({ value, type }: SendToMenuProps) {
  const io = useToolIO();
  const { setWorkbench } = useWorkbench();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, button);

  if (!io) return null;
  const from = io.tool;
  const targets = sendTargets(from, type);
  if (targets.length === 0) return null;

  return (
    <div
      ref={root}
      className="relative"
      // Close when focus leaves the menu, e.g. tabbing past the last item.
      onBlur={(event) => !root.current?.contains(event.relatedTarget as Node) && setOpen(false)}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className={`${panelButtonClass} inline-flex items-center gap-1`}
      >
        Send to
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          id={menuId}
          className="absolute right-0 top-full z-20 mt-1 min-w-56 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 font-[family-name:var(--font-ui)] text-sm normal-case tracking-normal text-[color:var(--text)] shadow-lg"
        >
          <li className="px-3 py-1.5 text-xs text-[color:var(--text-muted)]">
            Open this {dataTypeLabels[type]} in
          </li>
          {targets.map((target) => (
            <li key={target.id}>
              <Link
                href={toolHref(target)}
                onClick={() => setWorkbench({ type, value, origin: { kind: "send", from: from.id, to: target.id } })}
                className="block px-3 py-1.5 hover:bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] focus-visible:bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] focus-visible:outline-none"
              >
                {target.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

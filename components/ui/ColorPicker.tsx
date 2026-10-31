"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useDismiss } from "@/lib/hooks/useDismiss";

export interface Swatch {
  color: string;
  label: string;
}

interface ColorPickerProps {
  label: string;
  /** A CSS colour, or null for none. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** The swatches, in the rows the popover lays them out in. */
  rows: Swatch[][];
  /** Show the colour's name on the button instead of `label`, when a label already sits above it. */
  named?: boolean;
  /** Show this icon over a bar of the current colour instead of a label, for compact toolbars. */
  icon?: LucideIcon;
  /** Offer "None" (shown as a see-through checkerboard) at the start of the first row. */
  allowNone?: boolean;
}

const NONE: Swatch = { color: "", label: "None" };
const checkerboard = "repeating-conic-gradient(#c8c8c8 0 25%, #ffffff 0 50%) 0 0 / 8px 8px";

function Chip({ swatch, size }: { swatch: Swatch; size: string }) {
  return (
    <span
      aria-hidden
      className={`${size} block shrink-0 rounded border border-[color:color-mix(in_srgb,var(--text)_18%,transparent)]`}
      style={{ background: swatch.color || checkerboard }}
    />
  );
}

/**
 * A button showing the current colour that opens a grid of swatches. The grid is a radio group: one tab
 * stop, arrow keys move across and between rows, Enter or a click picks and closes, Escape closes.
 */
export default function ColorPicker({ label, value, onChange, rows, named = false, icon: Icon, allowNone = false }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const grid = allowNone ? [[NONE, ...rows[0]], ...rows.slice(1)] : rows;
  const all = grid.flat();
  const current = all.find((s) => (s.color || null) === value) ?? { color: value ?? "", label: value ?? "None" };
  const popoverId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, trigger);

  // Opening puts focus on the chosen swatch (or the first).
  useEffect(() => {
    if (!open) return;
    const i = Math.max(0, all.indexOf(current));
    setFocusIndex(i);
    refs.current[i]?.focus();
    // Only on open; `all` and `current` are rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(swatch: Swatch) {
    onChange(swatch.color || null);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    let row = 0;
    let col = focusIndex;
    while (col >= grid[row].length) col -= grid[row++].length;
    if (e.key === "ArrowRight") col++;
    else if (e.key === "ArrowLeft") col--;
    else if (e.key === "ArrowDown") row = Math.min(grid.length - 1, row + 1);
    else if (e.key === "ArrowUp") row = Math.max(0, row - 1);
    else if (e.key === "Home") col = row = 0;
    else if (e.key === "End") [row, col] = [grid.length - 1, Infinity];
    else return;
    e.preventDefault();
    // Moving past a row's end wraps to the next row; rows of different lengths clamp the column.
    if (col >= grid[row].length && e.key === "ArrowRight" && row < grid.length - 1) [row, col] = [row + 1, 0];
    if (col < 0 && row > 0) [row, col] = [row - 1, grid[row - 1].length - 1];
    col = Math.max(0, Math.min(grid[row].length - 1, col));
    const next = grid.slice(0, row).reduce((n, r) => n + r.length, 0) + col;
    setFocusIndex(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      ref={root}
      className="relative inline-block"
      onBlur={(e) => !root.current?.contains(e.relatedTarget as Node) && setOpen(false)}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`${label}: ${current.label}`}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-md border border-[color:var(--border)] px-2.5 py-1.5 text-sm hover:border-[color:var(--accent)]"
      >
        {Icon ? (
          <span aria-hidden className="flex flex-col items-center gap-0.5">
            <Icon className="h-4 w-4" />
            <span className="block h-1 w-5 rounded-sm border border-[color:color-mix(in_srgb,var(--text)_18%,transparent)]" style={{ background: current.color || checkerboard }} />
          </span>
        ) : (
          <>
            <Chip swatch={current} size="h-4 w-4" />
            <span aria-hidden>{named ? current.label : label}</span>
          </>
        )}
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 text-[color:var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          id={popoverId}
          role="radiogroup"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute left-0 top-full z-20 mt-1 space-y-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-lg"
        >
          {grid.map((row, r) => (
            <div key={r} className="flex gap-2">
              {row.map((swatch) => {
                const i = all.indexOf(swatch);
                const checked = swatch === current;
                return (
                  <button
                    key={swatch.label}
                    ref={(el) => {
                      refs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={swatch.label}
                    title={swatch.label}
                    tabIndex={i === focusIndex ? 0 : -1}
                    onClick={() => pick(swatch)}
                    className={`rounded-md p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${
                      checked ? "ring-2 ring-[color:var(--accent)]" : ""
                    }`}
                  >
                    <Chip swatch={swatch} size="h-7 w-7" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

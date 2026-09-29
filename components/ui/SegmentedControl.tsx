"use client";

import { useRef, type KeyboardEvent } from "react";

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * A row of mutually exclusive buttons, exposed as a radio group. Follows the ARIA radio group pattern:
 * one tab stop, arrow keys move and select, Home/End jump to the ends.
 */
export default function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, options.findIndex((option) => option.id === value));

  function onKeyDown(e: KeyboardEvent) {
    let next: number;
    if (e.key in STEP) next = (current + STEP[e.key] + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    onChange(options[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex max-w-full flex-wrap rounded-md border border-[color:var(--border)]">
      {options.map((option, i) => (
        <button
          key={option.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === current}
          tabIndex={i === current ? 0 : -1}
          onClick={() => onChange(option.id)}
          className={`px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md ${
            i === current
              ? "bg-[color:var(--accent)] text-white"
              : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

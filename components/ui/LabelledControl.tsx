import type { ReactNode } from "react";

/**
 * A control with its name shown beside it, for options whose choices don't explain themselves. The
 * control names itself for screen readers (like SegmentedControl's `label`), so this text is hidden from them.
 */
export default function LabelledControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="text-sm text-[color:var(--text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

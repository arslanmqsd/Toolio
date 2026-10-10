import type { ReactNode } from "react";

interface ValidSummaryProps {
  /** "Valid JSON", "Well-formed XML". */
  title: string;
  /** Label and value pairs about what was read. */
  items: [string, ReactNode][];
  /** Notes under the figures. */
  children?: ReactNode;
}

/** Says the input parsed, with a few figures about it, above a formatter's output. */
export default function ValidSummary({ title, items, children }: ValidSummaryProps) {
  return (
    <div className="mb-4 space-y-2 border-b border-[color:var(--border)] pb-4 font-[family-name:var(--font-ui)] text-xs">
      <p className="font-medium text-[color:var(--accent-text)]">{title}</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        {items.map(([label, value]) => (
          <div key={label} className="flex gap-1.5">
            <dt className="text-[color:var(--text-muted)]">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}

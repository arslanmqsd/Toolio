import type { ReactNode } from "react";

interface SectionProps {
  label: ReactNode;
  children: ReactNode;
  /** Heading level; defaults to h2 (the tool page title is h1). */
  as?: "h2" | "h3";
}

/** A labelled block inside a tool's output. */
export default function Section({ label, children, as: Heading = "h2" }: SectionProps) {
  return (
    <div>
      <Heading className="mb-2 font-[family-name:var(--font-ui)] text-xs font-medium text-[color:var(--accent-text)]">
        {label}
      </Heading>
      {children}
    </div>
  );
}

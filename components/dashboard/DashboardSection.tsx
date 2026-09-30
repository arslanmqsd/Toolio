import type { ReactNode } from "react";

interface DashboardSectionProps {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/** A titled block on the dashboard; `id` is its anchor, so links can jump to it. */
export default function DashboardSection({ id, title, description, children }: DashboardSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {description && <p className="mt-1 max-w-xl text-sm text-[color:var(--text-muted)]">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** What a section shows while its list loads, or when the list is empty. */
export function SectionNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-sm text-[color:var(--text-muted)]">
      {children}
    </p>
  );
}

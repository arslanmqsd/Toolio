import type { ReactNode } from "react";

interface ToolShellProps {
  title: string;
  description: string;
  /** The tool's UI: an <InputPanel> followed by an <OutputPanel>. */
  children: ReactNode;
}

export default function ToolShell({ title, description, children }: ToolShellProps) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-[color:var(--text-muted)]">{description}</p>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
    </main>
  );
}

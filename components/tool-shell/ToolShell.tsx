import type { ReactNode } from "react";
import { ToolIOProvider } from "./tool-io";
import WorkbenchBanner from "./WorkbenchBanner";
import PageTitle from "@/components/ui/PageTitle";

interface ToolShellProps {
  toolId: string;
  title: string;
  description: string;
  /** The tool's UI: an <InputPanel> followed by an <OutputPanel>. */
  children: ReactNode;
}

export default function ToolShell({ toolId, title, description, children }: ToolShellProps) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <PageTitle>{title}</PageTitle>
        <p className="mt-2 text-[color:var(--text-muted)]">{description}</p>
      </header>
      <ToolIOProvider toolId={toolId}>
        <WorkbenchBanner />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
      </ToolIOProvider>
    </main>
  );
}

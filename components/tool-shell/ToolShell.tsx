import type { ReactNode } from "react";
import FavoriteButton from "./FavoriteButton";
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
    <main className="mx-auto max-w-[var(--shell-max)] px-4 py-[var(--shell-py)]">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <PageTitle>{title}</PageTitle>
          <p className="mt-2 text-[color:var(--text-muted)]">{description}</p>
        </div>
        <FavoriteButton toolId={toolId} />
      </header>
      <ToolIOProvider toolId={toolId}>
        <WorkbenchBanner />
        <div className="grid grid-cols-1 gap-[var(--panel-gap)] lg:grid-cols-[repeat(var(--shell-columns),minmax(0,1fr))]">
          {children}
        </div>
      </ToolIOProvider>
    </main>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FavoriteButton from "./FavoriteButton";
import { ToolIOProvider } from "./tool-io";
import WorkbenchBanner from "./WorkbenchBanner";
import PageTitle from "@/components/ui/PageTitle";
import type { Category } from "@/registry";

interface ToolShellProps {
  toolId: string;
  /** Linked above the title, so visitors who land straight on a tool can reach its siblings. */
  category: Category;
  title: string;
  description: string;
  /** The tool's UI: an <InputPanel> followed by an <OutputPanel>. */
  children: ReactNode;
}

export default function ToolShell({ toolId, category, title, description, children }: ToolShellProps) {
  return (
    <main className="mx-auto max-w-[var(--shell-max)] px-4 py-[var(--shell-py)]">
      <nav aria-label="Breadcrumb" className="mb-3">
        <Link
          href={`/tools/${category.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {category.label}
        </Link>
      </nav>
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

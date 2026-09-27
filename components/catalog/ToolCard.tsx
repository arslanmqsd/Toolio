import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { IconTile } from "@/components/catalog/icons";
import type { CategoryId } from "@/registry";

interface ToolCardProps {
  id: string;
  category: CategoryId;
  title: string;
  description: string;
  /** Omit for planned tools: renders a non-interactive "Coming soon" card. */
  href?: string;
}

const cardClass =
  "flex h-full flex-col rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-5";

export default function ToolCard({ id, category, title, description, href }: ToolCardProps) {
  const body = (
    <>
      <IconTile category={category} toolId={id} />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-[color:var(--text-muted)]">{description}</p>
    </>
  );

  if (!href) {
    return (
      <div className={`${cardClass} opacity-60`}>
        {body}
        <span className="mt-4 self-start rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs text-[color:var(--text-muted)]">
          Coming soon
        </span>
      </div>
    );
  }

  return (
    <Link href={href} className={`${cardClass} group transition-colors hover:border-[color:var(--accent)]`}>
      {body}
      <ArrowRight
        aria-hidden
        className="mt-4 h-4 w-4 self-end text-[color:var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--accent-text)]"
      />
    </Link>
  );
}

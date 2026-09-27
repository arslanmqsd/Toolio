"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconTile } from "@/components/catalog/icons";
import { getToolById, toolHref, type ToolConfig } from "@/registry";
import { readRecentTools } from "@/lib/recent-tools/recent-tools";

/** Renders nothing for visitors with no recorded tool visits. */
export default function RecentTools() {
  const [tools, setTools] = useState<ToolConfig[]>([]);

  useEffect(() => {
    setTools(
      readRecentTools().flatMap((id) => getToolById(id) ?? []),
    );
  }, []);

  if (tools.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="mx-auto mt-10 max-w-2xl">
      <h2 id="recent-heading" className="mb-3 text-sm text-[color:var(--text-muted)]">
        Recently used
      </h2>
      <ul className="flex flex-wrap justify-center gap-2">
        {tools.map((tool) => (
          <li key={tool.id}>
            <Link
              href={toolHref(tool)}
              className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-raised)] py-1 pl-1 pr-3 text-sm hover:border-[color:var(--accent)]"
            >
              <IconTile category={tool.category} toolId={tool.id} size="sm" />
              {tool.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

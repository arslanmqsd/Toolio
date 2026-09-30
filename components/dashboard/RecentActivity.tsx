"use client";

import Link from "next/link";
import { IconTile } from "@/components/catalog/icons";
import { useNow } from "@/lib/hooks/useNow";
import { relativeTime } from "@/lib/relative-time";
import { useSyncedData } from "@/lib/sync";
import { getToolById, toolHref } from "@/registry";
import DashboardSection, { SectionNote } from "./DashboardSection";

export default function RecentActivity() {
  const [history] = useSyncedData("history");
  const now = useNow();
  const entries = (history ?? []).flatMap((entry) => {
    const tool = getToolById(entry.toolId);
    return tool ? [{ tool, usedAt: entry.usedAt }] : [];
  });

  return (
    <DashboardSection id="activity" title="Recent activity">
      {history === null ? (
        <SectionNote>Loading activity…</SectionNote>
      ) : entries.length === 0 ? (
        <SectionNote>Tools you use while signed in are listed here, on every device.</SectionNote>
      ) : (
        <ol className="divide-y divide-[color:var(--border)] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-raised)]">
          {entries.map(({ tool, usedAt }) => (
            <li key={tool.id}>
              <Link
                href={toolHref(tool)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[color:color-mix(in_srgb,var(--accent)_6%,transparent)]"
              >
                <IconTile category={tool.category} toolId={tool.id} size="sm" />
                <span className="flex-1 font-medium">{tool.title}</span>
                {usedAt && (
                  <time dateTime={usedAt} title={new Date(usedAt).toLocaleString()} className="text-[color:var(--text-muted)]">
                    {/* Clamped: a server clock a little ahead of this one shouldn't read "in 2 seconds". */}
                    {now === null ? "" : relativeTime(Math.min(Date.parse(usedAt), now), now)}
                  </time>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </DashboardSection>
  );
}

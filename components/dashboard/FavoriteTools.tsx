"use client";

import ToolCard from "@/components/catalog/ToolCard";
import { useSyncedData } from "@/lib/sync";
import { getToolById, toolHref } from "@/registry";
import DashboardSection, { SectionNote } from "./DashboardSection";

export default function FavoriteTools() {
  const [ids] = useSyncedData("favorites");
  const tools = (ids ?? []).flatMap((id) => getToolById(id) ?? []);

  return (
    <DashboardSection id="favorites" title="Favorites">
      {ids === null ? (
        <SectionNote>Loading favorites…</SectionNote>
      ) : tools.length === 0 ? (
        <SectionNote>Pin a tool with the star next to its title, and it shows up here.</SectionNote>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool.id}>
              <ToolCard {...tool} href={toolHref(tool)} />
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}

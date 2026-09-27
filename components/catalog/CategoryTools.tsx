import ToolCard from "@/components/catalog/ToolCard";
import { allTools, plannedTools, toolHref, type CategoryId } from "@/registry";

/** Live tools first, then planned ones as "Coming soon" cards. */
export default function CategoryTools({ category }: { category: CategoryId }) {
  const cards = [
    ...allTools.filter((t) => t.category === category).map((t) => ({ ...t, href: toolHref(t) })),
    ...plannedTools.filter((t) => t.category === category).map((t) => ({ ...t, href: undefined })),
  ];
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((tool) => (
        <li key={tool.id}>
          <ToolCard {...tool} />
        </li>
      ))}
    </ul>
  );
}

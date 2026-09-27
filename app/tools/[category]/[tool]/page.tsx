import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RecordToolVisit from "@/components/tool-shell/RecordToolVisit";
import ToolShell from "@/components/tool-shell/ToolShell";
import { allTools, getTool } from "@/registry";

interface ToolPageProps {
  params: { category: string; tool: string };
}

export const dynamicParams = false;

export function generateStaticParams() {
  return allTools.map((tool) => ({ category: tool.category, tool: tool.id }));
}

export function generateMetadata({ params }: ToolPageProps): Metadata {
  const tool = getTool(params.category, params.tool);
  return tool ? { title: `${tool.title} | Toolio`, description: tool.description } : {};
}

export default async function ToolPage({ params }: ToolPageProps) {
  const tool = getTool(params.category, params.tool);
  if (!tool) notFound();

  const { default: ToolComponent } = await tool.component();
  return (
    <ToolShell title={tool.title} description={tool.description}>
      <RecordToolVisit id={tool.id} />
      <ToolComponent />
    </ToolShell>
  );
}

import { actionLabels, TOOL_ACTIONS } from "./actions";
import { categories } from "./categories";
import { developerTools } from "./tools/developer";
import type { ToolConfig } from "./types";

export { actionLabels, categories, TOOL_ACTIONS };
export type { ToolAction } from "./actions";
export type { Category, CategoryId } from "./categories";
export { plannedTools, type PlannedTool } from "./planned";
export type { ToolConfig };

export const allTools: ToolConfig[] = [...developerTools];

const toolsByKey = new Map<string, ToolConfig>(
  allTools.map((tool) => [`${tool.category}/${tool.id}`, tool]),
);
const toolsById = new Map<string, ToolConfig>(allTools.map((tool) => [tool.id, tool]));

export function getTool(category: string, id: string): ToolConfig | undefined {
  return toolsByKey.get(`${category}/${id}`);
}

/** Tool ids are unique across categories. */
export function getToolById(id: string): ToolConfig | undefined {
  return toolsById.get(id);
}

export function toolHref(tool: ToolConfig): string {
  return `/tools/${tool.category}/${tool.id}`;
}

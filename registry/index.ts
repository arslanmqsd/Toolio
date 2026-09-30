import { actionLabels, TOOL_ACTIONS } from "./actions";
import { categories } from "./categories";
import { developerTools } from "./tools/developer";
import type { DataType } from "./data-types";
import type { ToolConfig } from "./types";

export { actionLabels, categories, TOOL_ACTIONS };
export type { ToolAction } from "./actions";
export type { Category, CategoryId } from "./categories";
export { DATA_TYPES, dataTypeLabels, type DataType } from "./data-types";
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

/** Other tools that can take `type` as input, when `from` lists it among what it produces. */
export function sendTargets(from: ToolConfig, type: DataType): ToolConfig[] {
  if (!from.produces.includes(type)) return [];
  return allTools.filter((tool) => tool.id !== from.id && tool.consumes.includes(type));
}

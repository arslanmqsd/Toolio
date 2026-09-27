import type { ComponentType } from "react";
import type { ToolAction } from "./actions";
import type { CategoryId } from "./categories";

export interface ToolConfig {
  id: string;
  category: CategoryId;
  title: string;
  description: string;
  keywords: string[];
  actions: ToolAction[];
  component: () => Promise<{ default: ComponentType }>;
  consumes: string[];
  produces: string[];
}

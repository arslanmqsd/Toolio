import type { ComponentType } from "react";
import type { ToolAction } from "./actions";
import type { CategoryId } from "./categories";
import type { DataType } from "./data-types";

export interface ToolConfig {
  id: string;
  category: CategoryId;
  title: string;
  description: string;
  keywords: string[];
  actions: ToolAction[];
  component: () => Promise<{ default: ComponentType }>;
  /** Data this tool can start from; pasted or sent data of these types can pre-fill its input. */
  consumes: DataType[];
  /** Every type its output can be. The output panel says which one is showing now. */
  produces: DataType[];
}

export const TOOL_ACTIONS = [
  "convert",
  "clean",
  "generate",
  "compare",
  "calculate",
  "extract",
  "format",
  "transform",
  "inspect",
] as const;

export type ToolAction = (typeof TOOL_ACTIONS)[number];

export const actionLabels: Record<ToolAction, string> = {
  convert: "Convert",
  clean: "Clean",
  generate: "Generate",
  compare: "Compare",
  calculate: "Calculate",
  extract: "Extract",
  format: "Format",
  transform: "Transform",
  inspect: "Inspect",
};

import { describe, expect, it } from "vitest";
import { allTools } from "@/registry";
import { TOOL_COMPONENTS } from "./ToolComponent";

describe("TOOL_COMPONENTS", () => {
  it("has a component for every tool and none for tools that don't exist", () => {
    expect(Object.keys(TOOL_COMPONENTS).sort()).toEqual(allTools.map((tool) => tool.id).sort());
  });
});

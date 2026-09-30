import { describe, expect, it } from "vitest";
import { allTools, getToolById } from "@/registry";
import { toolDescription, toolMetadata } from "./seo";

describe("toolMetadata", () => {
  it("builds title, description, keywords and canonical URL from the registry", () => {
    const tool = getToolById("jwt-decoder")!;
    const metadata = toolMetadata(tool);
    expect(metadata.title).toBe("JWT Decoder");
    expect(metadata.description).toBe(toolDescription(tool));
    expect(metadata.description).toContain(tool.description);
    expect(metadata.keywords).toEqual(expect.arrayContaining([...tool.keywords, "developer"]));
    expect(metadata.alternates?.canonical).toBe("/tools/developer/jwt-decoder");
    expect(metadata.openGraph?.url).toBe("/tools/developer/jwt-decoder");
  });

  it("does not repeat keywords", () => {
    for (const tool of allTools) {
      const keywords = toolMetadata(tool).keywords as string[];
      expect(new Set(keywords).size).toBe(keywords.length);
    }
  });

  it("keeps every description within what search results show", () => {
    for (const tool of allTools) expect(toolDescription(tool).length, tool.id).toBeLessThanOrEqual(160);
  });
});

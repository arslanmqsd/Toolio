import { describe, expect, it } from "vitest";
import { allTools, getToolById, sendTargets } from "@/registry";

const ids = (tools: { id: string }[]) => tools.map((tool) => tool.id).sort();

describe("sendTargets", () => {
  it("lists other tools that consume the output type", () => {
    expect(ids(sendTargets(getToolById("jwt-decoder")!, "json"))).toEqual(["json-formatter", "json-to-types"]);
    expect(ids(sendTargets(getToolById("json-formatter")!, "json"))).toEqual(["json-to-types"]);
    expect(ids(sendTargets(getToolById("url-encoder")!, "text"))).toEqual(["hash-generator", "regex-tester"]);
  });

  it("ignores types the tool doesn't declare in produces", () => {
    expect(sendTargets(getToolById("jwt-decoder")!, "text")).toEqual([]);
  });

  it("returns nothing when no other tool consumes the type", () => {
    expect(sendTargets(getToolById("uuid-generator")!, "uuid")).toEqual([]);
  });
});

describe("tool data types", () => {
  it("don't repeat within a tool", () => {
    for (const tool of allTools) {
      expect(new Set(tool.consumes).size, `${tool.id} consumes`).toBe(tool.consumes.length);
      expect(new Set(tool.produces).size, `${tool.id} produces`).toBe(tool.produces.length);
    }
  });
});

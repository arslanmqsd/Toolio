import { describe, expect, it } from "vitest";
import { allTools } from "@/registry";
import { createSearch, search } from "./search";

const topId = (query: string) => search(query)[0]?.tool.id;

describe("search", () => {
  it.each([
    ["Convert this JSON to TypeScript", "json-to-types"],
    ["json to go struct", "json-to-types"],
    ["python", "json-to-types"],
    ["typscript", "json-to-types"],
    ["Decode a JWT", "jwt-decoder"],
    ["read token payload", "jwt-decoder"],
    ["is my token expired", "jwt-decoder"],
    ["check when token expires", "jwt-decoder"],
    ["JWT", "jwt-decoder"],
    ["url encode", "url-encoder"],
    ["decode a url", "url-encoder"],
    ["test my regex", "regex-tester"],
    ["convert epoch to date", "unix-timestamp"],
    ["unix timestamp", "unix-timestamp"],
    ["timestamp to date", "unix-timestamp"],
    ["generate uuid", "uuid-generator"],
    ["guid", "uuid-generator"],
    ["md5 hash", "hash-generator"],
    ["verify file checksum", "hash-generator"],
    ["sha256", "hash-generator"],
    ["what does this regular expression mean", "regex-tester"],
    ["prettify json", "json-formatter"],
    ["is my json valid", "json-formatter"],
    ["minify json", "json-formatter"],
    ["convert this curl to python", "curl-converter"],
    ["curl to fetch", "curl-converter"],
  ])("ranks %j → %s first", (query, id) => {
    expect(topId(query)).toBe(id);
  });

  it("returns nothing for tasks no tool covers", () => {
    expect(search("Format messy SQL")).toEqual([]);
    expect(search("compare two files")).toEqual([]);
    expect(search("xyz")).toEqual([]);
  });

  it("returns nothing for blank or stopword-only queries", () => {
    expect(search("")).toEqual([]);
    expect(search("   ")).toEqual([]);
    expect(search("how do i")).toEqual([]);
  });

  it("sorts by score and respects the limit", () => {
    const results = search("json");
    expect(results.map((r) => r.score)).toEqual([...results.map((r) => r.score)].sort((a, b) => a - b));
    expect(search("json", 1)).toHaveLength(1);
  });

  it("searches whatever tool list it is given", () => {
    const only = createSearch(allTools.filter((t) => t.id === "jwt-decoder"));
    expect(only("json to typescript")).toEqual([]);
    expect(only("decode jwt")[0].tool.id).toBe("jwt-decoder");
  });
});

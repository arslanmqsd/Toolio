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
    ["compare two files", "text-diff-checker"],
    ["paste git diff", "git-diff-viewer"],
    ["jsonl to json", "json-jsonl-converter"],
    ["convert ndjson", "json-jsonl-converter"],
    ["find broken jsonl line", "json-jsonl-converter"],
    ["markdown to html", "markdown-html-converter"],
    ["html to md", "markdown-html-converter"],
    ["preview readme", "markdown-html-converter"],
    ["read token payload", "jwt-decoder"],
    ["is my token expired", "jwt-decoder"],
    ["check when token expires", "jwt-decoder"],
    ["JWT", "jwt-decoder"],
    ["url encode", "url-encoder"],
    ["decode a url", "url-encoder"],
    ["parse url", "url-parser"],
    ["url query parameters", "url-parser"],
    ["oauth callback url", "url-parser"],
    ["base64 decode", "base64-converter"],
    ["image to base64", "base64-converter"],
    ["base64url", "base64-converter"],
    ["gitignore", "gitignore-generator"],
    ["node gitignore", "gitignore-generator"],
    ["combine gitignore files", "gitignore-generator"],
    ["jsonpath", "json-path-tester"],
    ["test json path", "json-path-tester"],
    ["query json with jsonpath", "json-path-tester"],
    ["test my regex", "regex-tester"],
    ["convert epoch to date", "unix-timestamp"],
    ["unix timestamp", "unix-timestamp"],
    ["timestamp to date", "unix-timestamp"],
    ["generate uuid", "uuid-generator"],
    ["guid", "uuid-generator"],
    ["md5 hash", "hash-generator"],
    ["verify file checksum", "hash-generator"],
    ["sha256", "hash-generator"],
    ["what does 502 mean", "http-status"],
    ["rate limited", "http-status"],
    ["401 vs 403", "http-status"],
    ["http status code", "http-status"],
    ["generate config from .env", "env-generator"],
    ["dotenv", "env-generator"],
    ["zod env schema", "env-generator"],
    ["pydantic settings", "env-generator"],
    ["what does this regular expression mean", "regex-tester"],
    ["prettify json", "json-formatter"],
    ["is my json valid", "json-formatter"],
    ["minify json", "json-formatter"],
    ["convert this curl to python", "curl-converter"],
    ["curl to fetch", "curl-converter"],
    ["Format messy SQL", "sql-formatter"],
    ["clean up query", "sql-formatter"],
    ["sql beautifier", "sql-formatter"],
    ["minify sql", "sql-formatter"],
    ["pretty print sql", "sql-formatter"],
    ["sql to mongodb", "sql-to-mongo"],
    ["convert sql query to mongo", "sql-to-mongo"],
    ["mongodb query from sql", "sql-to-mongo"],
    ["sql to nosql", "sql-to-mongo"],
  ])("ranks %j → %s first", (query, id) => {
    expect(topId(query)).toBe(id);
  });

  it("returns nothing for tasks no tool covers", () => {
    expect(search("resize a photo")).toEqual([]);
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

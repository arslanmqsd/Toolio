import { describe, expect, it } from "vitest";
import { detectType } from "./detectors";

// {"alg":"HS256","typ":"JWT"} . {"sub":"1234567890"} . signature
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("detectType", () => {
  it.each([
    ["curl https://api.example.com", "curl"],
    ["  curl -X POST https://x.test \\\n  -d 'a=1'", "curl"],
    ["$ curl https://x.test", "curl"],
    [JWT, "jwt"],
    [`Bearer ${JWT}`, "jwt"],
    [`${JWT.split(".").slice(0, 2).join(".")}.`, "jwt"],
    ['{"a": 1}', "json"],
    ["  [1, 2, 3]\n", "json"],
    ["*/15 9-17 * * MON-FRI", "cron"],
    ["@daily", "cron"],
    ["1 2 3 4 5", "text"],
    ["5 * 3", "text"],
    ["@someone said hi", "text"],
    ["www.example.com", "text"],
    ["v1.2.3", "text"],
    ["a.b.c", "text"],
    ["42", "text"],
    ["true", "text"],
    ['{"a": 1', "text"],
    ['{"a": 1}\n{"a": 2}\n', "jsonl"],
    ['[1, 2]\r\n\r\n["x"]', "jsonl"],
    ['{"a": 1}\n{"a": 2,}', "jsonl"],
    ['{"a": 1}', "json"],
    ["{a}\n{b}", "text"],
    ['{\n  "a": 1,\n}', "text"],
    ["curly braces", "text"],
    ["hello world", "text"],
    ["diff --git a/x.ts b/x.ts\nindex 1..2 100644\n", "diff"],
    ["commit 0123456789abcdef0123456789abcdef01234567\nAuthor: A\n\ndiff --git a/x b/x\n", "diff"],
    ["--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b", "diff"],
    ["---\ntitle: front matter\n---", "text"],
    ["commit 0123456 has no diff", "text"],
    ["   ", "text"],
  ])("%j → %s", (input, expected) => {
    expect(detectType(input)).toBe(expected);
  });
});

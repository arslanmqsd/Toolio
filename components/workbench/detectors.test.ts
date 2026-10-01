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
    ["curly braces", "text"],
    ["hello world", "text"],
    ["   ", "text"],
  ])("%j → %s", (input, expected) => {
    expect(detectType(input)).toBe(expected);
  });
});

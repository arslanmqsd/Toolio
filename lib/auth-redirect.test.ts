import { describe, expect, it } from "vitest";
import { safeNextPath } from "./auth-redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths, including query strings", () => {
    expect(safeNextPath("/tools/developer/jwt-decoder")).toBe("/tools/developer/jwt-decoder");
    expect(safeNextPath("/dashboard?tab=snippets")).toBe("/dashboard?tab=snippets");
  });

  it("falls back to the home page for anything that could leave the site", () => {
    for (const next of [null, undefined, "", "dashboard", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      expect(safeNextPath(next), String(next)).toBe("/");
    }
  });
});

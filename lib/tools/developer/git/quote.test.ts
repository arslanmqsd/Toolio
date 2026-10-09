import { describe, expect, it } from "vitest";
import { escapeEre } from "./quote";

describe("escapeEre", () => {
  it("escapes regex metacharacters but not slashes", () => {
    expect(escapeEre("release-1.0")).toBe("release-1\\.0");
    expect(escapeEre("feature/a+b")).toBe("feature/a\\+b");
  });
});

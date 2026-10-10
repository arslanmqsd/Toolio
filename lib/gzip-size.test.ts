import { describe, expect, it } from "vitest";
import { gzipSize, measureSizeChange } from "./gzip-size";

describe("gzipSize", () => {
  it("measures the gzipped size in bytes", async () => {
    const size = await gzipSize("a".repeat(10_000));
    expect(size).toBeGreaterThan(20);
    expect(size).toBeLessThan(100);
  });
});

describe("measureSizeChange", () => {
  it("counts UTF-8 bytes on both sides", async () => {
    const sizes = await measureSizeChange("é  é", "é é");
    expect(sizes).toMatchObject({ input: 6, output: 5 });
    expect(sizes.inputGzip).toBeGreaterThan(0);
  });
});

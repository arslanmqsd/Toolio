import { describe, expect, it } from "vitest";
import { checkTextFile } from "./text-file";

const MB = 1024 * 1024;

describe("checkTextFile", () => {
  it("accepts small text", () => {
    expect(checkTextFile(5, new TextEncoder().encode("hello"), 2 * MB)).toBeNull();
  });

  it("rejects files over the limit", () => {
    expect(checkTextFile(2 * MB + 1, new Uint8Array(), 2 * MB)).toBe("This file is over 2 MB.");
  });

  it("rejects files with a NUL byte as binary", () => {
    expect(checkTextFile(4, new Uint8Array([0x89, 0x50, 0x00, 0x47]), 2 * MB)).toBe(
      "This looks like a binary file, not text.",
    );
  });
});

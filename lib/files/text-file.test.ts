import { describe, expect, it } from "vitest";
import { checkTextFile, decodeTextBytes } from "./text-file";

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

describe("decodeTextBytes", () => {
  it("reads UTF-8, dropping a byte order mark", () => {
    expect(decodeTextBytes(new TextEncoder().encode("\uFEFFCafé"))).toEqual({ text: "Café", encoding: "utf-8" });
  });

  it("falls back to Windows-1252 for bytes that aren't UTF-8", () => {
    // "Café – €5" as Excel saves it on Windows.
    expect(decodeTextBytes(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x96, 0x20, 0x80, 0x35]))).toEqual({ text: "Café – €5", encoding: "windows-1252" });
  });
});

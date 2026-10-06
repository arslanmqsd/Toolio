import { describe, expect, it } from "vitest";
import { detectFileKind, downloadName, hexDump, parseDataUrl, toDataUrl } from "./base64";

describe("data URLs", () => {
  it("splits a Base64 data URL", () => {
    expect(parseDataUrl("data:image/png;base64,iVBORw0KGgo=")).toEqual({ mimeType: "image/png", base64: "iVBORw0KGgo=" });
    expect(parseDataUrl("data:text/plain;charset=utf-8;base64,SGk=")).toEqual({ mimeType: "text/plain", base64: "SGk=" });
    expect(parseDataUrl("data:;base64,SGk=")).toEqual({ mimeType: "application/octet-stream", base64: "SGk=" });
  });

  it("ignores data URLs that aren't Base64, and plain text", () => {
    expect(parseDataUrl("data:text/plain,hello")).toBeNull();
    expect(parseDataUrl("SGk=")).toBeNull();
  });

  it("builds one", () => {
    expect(toDataUrl("SGk=", "text/plain")).toBe("data:text/plain;base64,SGk=");
    expect(toDataUrl("SGk=", "")).toBe("data:application/octet-stream;base64,SGk=");
  });
});

describe("detectFileKind", () => {
  it("recognises files by their first bytes", () => {
    expect(detectFileKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toMatchObject({ extension: "png", previewable: true });
    expect(detectFileKind(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toMatchObject({ extension: "webp" });
    expect(detectFileKind(new TextEncoder().encode("%PDF-1.7"))).toMatchObject({ extension: "pdf", previewable: false });
  });

  it("never previews SVG, even when the data URL says it's an image", () => {
    expect(detectFileKind(new TextEncoder().encode("<svg"), "image/svg+xml")).toMatchObject({ extension: "svg", previewable: false });
  });

  it("falls back to binary data", () => {
    expect(detectFileKind(new Uint8Array([1, 2, 3]))).toMatchObject({ label: "Binary data", extension: "bin" });
  });
});

describe("hexDump", () => {
  it("shows offset, hex and printable characters", () => {
    expect(hexDump(new TextEncoder().encode("Hi\n"), 64)).toBe(`00000000  48 69 0A${" ".repeat(39)}  Hi.`);
  });

  it("stops at the limit", () => {
    expect(hexDump(new Uint8Array(100), 32).split("\n")).toHaveLength(2);
  });
});

describe("downloadName", () => {
  it("keeps the source name's stem", () => {
    expect(downloadName("png", "photo.b64.txt")).toBe("photo.b64.png");
    expect(downloadName("bin")).toBe("decoded.bin");
  });
});

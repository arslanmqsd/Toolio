import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, bytesToText, textToBase64, wrapLines } from "./base64";

const decodeText = (input: string) => {
  const result = base64ToBytes(input);
  if (!result.ok) throw new Error(result.error);
  return bytesToText(result.bytes);
};

describe("encoding", () => {
  it("encodes UTF-8 text, including emoji", () => {
    expect(textToBase64("Hello, World!")).toBe("SGVsbG8sIFdvcmxkIQ==");
    expect(textToBase64("café 👋")).toBe("Y2Fmw6kg8J+Riw==");
  });

  it("writes Base64URL with or without padding", () => {
    expect(textToBase64("café 👋", { urlSafe: true })).toBe("Y2Fmw6kg8J-Riw==");
    expect(textToBase64("café 👋", { urlSafe: true, padding: false })).toBe("Y2Fmw6kg8J-Riw");
  });

  it("encodes every byte value and large inputs", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const big = new Uint8Array(200_000).fill(0xfb);
    expect(base64ToBytes(bytesToBase64(bytes))).toMatchObject({ ok: true, bytes });
    // Checked with a loop: a deep equality diff of 200,000 elements is slow enough to time out.
    const decoded = base64ToBytes(bytesToBase64(big, { urlSafe: true }));
    expect(decoded.ok && decoded.variant === "url-safe" && decoded.bytes.length === big.length && decoded.bytes.every((b) => b === 0xfb)).toBe(true);
  });

  it("handles empty input", () => {
    expect(textToBase64("")).toBe("");
    expect(base64ToBytes("")).toMatchObject({ ok: true, bytes: new Uint8Array() });
  });
});

describe("decoding", () => {
  it("reads both alphabets, with or without padding", () => {
    expect(decodeText("Y2Fmw6kg8J+Riw==")).toBe("café 👋");
    expect(decodeText("Y2Fmw6kg8J-Riw")).toBe("café 👋");
    expect(base64ToBytes("Y2Fmw6kg8J-Riw")).toMatchObject({ variant: "url-safe", padded: false });
    expect(base64ToBytes("Y2Fmw6kg8J+Riw==")).toMatchObject({ variant: "standard", padded: true });
    expect(base64ToBytes("SGk=")).toMatchObject({ variant: null });
  });

  it("ignores line wrapping and surrounding whitespace", () => {
    expect(decodeText("  SGVsbG8s\r\nIFdvcmxk\n  IQ==\n")).toBe("Hello, World!");
  });

  it("points at the character that's wrong", () => {
    expect(base64ToBytes("SGV*bG8=")).toEqual({ ok: false, error: '"*" isn\'t a Base64 character.', offset: 3 });
    expect(base64ToBytes("ab+c-d==")).toMatchObject({ ok: false, offset: 4 });
    expect(base64ToBytes("SG=VsbG8")).toMatchObject({ ok: false, error: '"=" padding can only come at the end.', offset: 2 });
  });

  it("rejects impossible lengths and padding", () => {
    expect(base64ToBytes("SGVsb")).toMatchObject({ ok: false, offset: 5 });
    expect(base64ToBytes("SGk==")).toMatchObject({ ok: false, offset: 3 });
  });

  it("returns null text for bytes that aren't UTF-8", () => {
    expect(bytesToText(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
  });
});

describe("wrapLines", () => {
  it("breaks into fixed-width lines", () => {
    expect(wrapLines("abcdefghij", 4)).toBe("abcd\nefgh\nij");
    expect(wrapLines("abc", 0)).toBe("abc");
  });
});

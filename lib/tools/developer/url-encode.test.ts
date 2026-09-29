import { describe, expect, it } from "vitest";
import { decodeUrl, encodeUrl, looksEncoded, parseUrlParts, type UrlScheme } from "./url-encode";

const out = (result: ReturnType<typeof encodeUrl>) => {
  if (!result.ok) throw new Error(result.error);
  return result.output;
};

// Deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const CHARS = [..."aZ09 -_.!~*'()%+&=?#/:;,@$[]\"<>\\^`{|}\n\té日本😀"];

function randomText(rand: () => number): string {
  return Array.from({ length: Math.floor(rand() * 12) }, () => CHARS[Math.floor(rand() * CHARS.length)]).join("");
}

describe("encodeUrl", () => {
  it("matches the platform's encoders for 3,000 random strings", () => {
    const rand = rng(3);
    for (let n = 0; n < 3000; n++) {
      const text = randomText(rand);
      expect(out(encodeUrl(text, "component"))).toBe(encodeURIComponent(text));
      expect(out(encodeUrl(text, "uri"))).toBe(encodeURI(text));
      expect(out(encodeUrl(text, "form"))).toBe(new URLSearchParams({ a: text }).toString().slice(2));
    }
  });

  it("keeps URL structure with the full-URL scheme", () => {
    expect(out(encodeUrl("https://x.test/a b?q=café&x=1#top", "uri"))).toBe("https://x.test/a%20b?q=caf%C3%A9&x=1#top");
  });

  it("reports unpaired surrogates instead of throwing", () => {
    const result = encodeUrl("ab\ud800c", "component");
    expect(result).toEqual({
      ok: false,
      offset: 2,
      error: "Position 2 has a broken character (an unpaired surrogate) that can't be encoded.",
    });
  });
});

describe("decodeUrl", () => {
  it("round-trips 3,000 random strings in every scheme", () => {
    const rand = rng(11);
    for (let n = 0; n < 3000; n++) {
      const text = randomText(rand);
      for (const scheme of ["component", "form"] as UrlScheme[]) {
        expect(out(decodeUrl(out(encodeUrl(text, scheme)), scheme))).toBe(text);
      }
      // decodeURI leaves escapes for reserved characters (like %2F) alone, just as the platform does.
      expect(out(decodeUrl(out(encodeUrl(text, "uri")), "uri"))).toBe(decodeURI(encodeURI(text)));
    }
  });

  it("decodes + as a space only in form mode", () => {
    expect(out(decodeUrl("a+b%2Bc", "form"))).toBe("a b+c");
    expect(out(decodeUrl("a+b%2Bc", "component"))).toBe("a+b+c");
  });

  it("points at malformed escapes", () => {
    expect(decodeUrl("100%", "component")).toEqual({ ok: false, offset: 3, error: '"%" at position 3 isn\'t followed by two hex digits.' });
    expect(decodeUrl("a%zz", "component")).toMatchObject({ ok: false, offset: 1 });
    expect(decodeUrl("ok%C3%28", "component")).toEqual({
      ok: false,
      offset: 2,
      error: "The escapes starting at position 2 aren't valid UTF-8 text.",
    });
  });

  it("agrees with decodeURIComponent on what's malformed", () => {
    const rand = rng(5);
    const pieces = ["%", "%2", "%41", "%C3", "%A9", "%E2%82", "%AC", "%FF", "a", "é", "+"];
    for (let n = 0; n < 3000; n++) {
      const text = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => pieces[Math.floor(rand() * pieces.length)]).join("");
      let native = true;
      try {
        decodeURIComponent(text);
      } catch {
        native = false;
      }
      expect(decodeUrl(text, "component").ok, text).toBe(native);
    }
  });
});

describe("looksEncoded", () => {
  it("detects text that would decode further", () => {
    expect(looksEncoded("caf%25C3%25A9")).toBe(true);
    expect(looksEncoded("100% sure")).toBe(false);
    expect(looksEncoded("plain")).toBe(false);
  });
});

describe("parseUrlParts", () => {
  it("breaks a URL into parts with decoded parameters", () => {
    expect(parseUrlParts(" https://ada@example.com:8080/a%20b/c?q=caf%C3%A9+au+lait&tag=a&tag=b#top ")).toEqual({
      protocol: "https",
      username: "ada",
      host: "example.com",
      port: "8080",
      pathname: "/a%20b/c",
      params: [
        ["q", "café au lait"],
        ["tag", "a"],
        ["tag", "b"],
      ],
      hash: "top",
    });
  });

  it("returns null for things that aren't absolute URLs", () => {
    expect(parseUrlParts("example.com/path")).toBeNull();
    expect(parseUrlParts("caf%C3%A9")).toBeNull();
    expect(parseUrlParts("https://exa mple.com")).toBeNull();
  });
});

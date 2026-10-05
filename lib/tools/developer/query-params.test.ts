import { describe, expect, it } from "vitest";
import { createParam, occurrences, parseQuery, serializeQuery, sortParams, updateParam } from "./query-params";

describe("parseQuery", () => {
  it("keeps every occurrence of a repeated key, in order", () => {
    expect(parseQuery("?tag=javascript&tag=python&tag=rust").map((p) => [p.key, p.value])).toEqual([
      ["tag", "javascript"],
      ["tag", "python"],
      ["tag", "rust"],
    ]);
  });

  it("tells an empty value from no value, and drops neither", () => {
    expect(parseQuery("foo=&bar")).toEqual([
      { rawKey: "foo", rawValue: "", hasEquals: true, key: "foo", value: "" },
      { rawKey: "bar", rawValue: "", hasEquals: false, key: "bar", value: "" },
    ]);
  });

  it("decodes escapes, + as space, Unicode and emoji, keeping the raw text", () => {
    const [q, path, emoji, nested] = parseQuery("q=caf%C3%A9+au%20lait&path=a%2Fb%3Fc%26d%3De&e=%F0%9F%9A%80&next=%2Fcb%3Fx%3D1%23top");
    expect(q).toMatchObject({ rawValue: "caf%C3%A9+au%20lait", value: "café au lait" });
    expect(path.value).toBe("a/b?c&d=e");
    expect(emoji.value).toBe("🚀");
    expect(nested.value).toBe("/cb?x=1#top");
  });

  it("skips empty pieces like URLSearchParams does", () => {
    expect(parseQuery("a=1&&b=2&").map((p) => p.key)).toEqual(["a", "b"]);
  });

  it("handles a long query without trouble", () => {
    const query = Array.from({ length: 10_000 }, (_, i) => `k${i}=v${i}`).join("&");
    const params = parseQuery(query);
    expect(params).toHaveLength(10_000);
    expect(serializeQuery(params)).toBe(query);
  });
});

describe("editing", () => {
  const params = parseQuery("q=caf%C3%A9+au+lait&tilde=~x&flag");

  it("serializes untouched params exactly as written", () => {
    expect(serializeQuery(params)).toBe("q=caf%C3%A9+au+lait&tilde=~x&flag");
  });

  it("re-encodes only the part that changed", () => {
    const edited = [params[0], updateParam(params[1], { value: "a b&c" }), params[2]];
    expect(serializeQuery(edited)).toBe("q=caf%C3%A9+au+lait&tilde=a%20b%26c&flag");
    expect(serializeQuery([updateParam(params[0], { key: "query" })])).toBe("query=caf%C3%A9+au+lait");
  });

  it("gives a valueless param an = once it gets a value", () => {
    expect(serializeQuery([updateParam(params[2], { value: "1" })])).toBe("flag=1");
  });

  it("encodes new params", () => {
    expect(serializeQuery([createParam("a&b", "🚀 x")])).toBe("a%26b=%F0%9F%9A%80%20x");
  });

  it("sorts by key only when asked, keeping repeats in order", () => {
    expect(sortParams(parseQuery("b=1&a=2&b=0&a=1")).map((p) => `${p.key}=${p.value}`)).toEqual(["a=2", "a=1", "b=1", "b=0"]);
  });

  it("numbers repeated keys", () => {
    expect(occurrences(parseQuery("tag=a&x=1&tag=b"))).toEqual([{ n: 1, of: 2 }, null, { n: 2, of: 2 }]);
  });
});

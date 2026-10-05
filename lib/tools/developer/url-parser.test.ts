import { describe, expect, it } from "vitest";
import { buildUrl, draftFrom, normalizeUrl, parseUrl, pathSegments, resolveUrl, safeDecode, type ParsedUrl } from "./url-parser";

const parsed = (text: string): ParsedUrl => {
  const result = parseUrl(text);
  if (!result.ok) throw new Error(result.error);
  return result.url;
};

describe("parseUrl", () => {
  it("breaks an absolute URL into its parts", () => {
    expect(parsed("https://api.example.com:8443/users/123?include=profile&sort=desc#details")).toMatchObject({
      type: "absolute",
      opaque: false,
      protocol: "https:",
      hostname: "api.example.com",
      port: "8443",
      origin: "https://api.example.com:8443",
      pathname: "/users/123",
      pathSegments: ["users", "123"],
      search: "?include=profile&sort=desc",
      hash: "#details",
      dangerous: false,
    });
  });

  it("drops the default port, as browsers do", () => {
    expect(parsed("http://example.com:80/").port).toBe("");
  });

  it("reads credentials, still encoded", () => {
    expect(parsed("https://ada:p%40ss@example.com/")).toMatchObject({ username: "ada", password: "p%40ss", hostname: "example.com" });
  });

  it("keeps an encoded slash inside its path segment", () => {
    expect(parsed("https://x.dev/files/a%2Fb/c").pathSegments).toEqual(["files", "a%2Fb", "c"]);
  });

  it("keeps an encoded # in query data out of the fragment", () => {
    const url = parsed("https://x.dev/?next=%2Fa%23b#real");
    expect(url.searchParams[0].value).toBe("/a#b");
    expect(url.hash).toBe("#real");
  });

  it("parses Unicode hosts and paths", () => {
    expect(parsed("https://münchen.de/straße?q=🚀")).toMatchObject({
      hostname: "xn--mnchen-3ya.de",
      pathname: "/stra%C3%9Fe",
      searchParams: [expect.objectContaining({ value: "🚀" })],
    });
  });

  it("labels relative URLs and keeps their path as written", () => {
    expect(parsed("../images/logo.png")).toMatchObject({ type: "relative", protocol: "", hostname: "", pathname: "../images/logo.png" });
    expect(parsed("/api/users?page=2#top")).toMatchObject({ pathname: "/api/users", search: "?page=2", hash: "#top", pathSegments: ["api", "users"] });
    expect(parsed("./dashboard").pathSegments).toEqual([".", "dashboard"]);
    expect(parsed("?only=query")).toMatchObject({ pathname: "", searchParams: [expect.objectContaining({ key: "only" })] });
  });

  it("labels protocol-relative URLs without inventing a protocol", () => {
    expect(parsed("//cdn.example.com/lib.js")).toMatchObject({ type: "protocol-relative", protocol: "", hostname: "cdn.example.com", origin: "" });
  });

  it("treats mailto:, tel:, javascript: and data: as opaque", () => {
    expect(parsed("mailto:ada@example.com?subject=Hi%20there")).toMatchObject({
      opaque: true,
      protocol: "mailto:",
      hostname: "",
      pathname: "ada@example.com",
      pathSegments: [],
      searchParams: [expect.objectContaining({ key: "subject", value: "Hi there" })],
      dangerous: false,
    });
    expect(parsed("tel:+1-555-0100")).toMatchObject({ opaque: true, pathname: "+1-555-0100" });
    expect(parsed("javascript:alert(1)")).toMatchObject({ opaque: true, dangerous: true });
    expect(parsed("data:text/html,<b>x</b>")).toMatchObject({ opaque: true, dangerous: true });
  });

  it("parses ftp: and file: URLs with an authority", () => {
    expect(parsed("ftp://files.example.com/pub/a.txt")).toMatchObject({ opaque: false, hostname: "files.example.com", origin: "ftp://files.example.com" });
    expect(parsed("file:///etc/hosts")).toMatchObject({ opaque: false, pathname: "/etc/hosts", origin: "", dangerous: true });
  });

  it("explains invalid URLs", () => {
    expect(parseUrl("")).toEqual({ ok: false, error: "Enter a URL." });
    expect(parseUrl("https://")).toEqual({ ok: false, error: "The host name is missing." });
    expect(parseUrl("https://exa mple.com")).toEqual({ ok: false, error: "The host name can't contain spaces." });
    expect(parseUrl("https://x.com:99999/")).toEqual({ ok: false, error: "Port 99999 is out of range; ports go up to 65535." });
    expect(parseUrl("https://x.com:abc/")).toEqual({ ok: false, error: 'The port "abc" must be a number.' });
    expect(parseUrl("https://x.com/a\nb")).toEqual({ ok: false, error: "URLs can't contain line breaks or tabs." });
  });
});

describe("pathSegments and safeDecode", () => {
  it("drops the leading and trailing slash but keeps empty middle segments", () => {
    expect(pathSegments("/users/123/orders/456/")).toEqual(["users", "123", "orders", "456"]);
    expect(pathSegments("/a//b")).toEqual(["a", "", "b"]);
    expect(pathSegments("/")).toEqual([]);
  });

  it("leaves malformed escapes alone", () => {
    expect(safeDecode("a%2Fb")).toBe("a/b");
    expect(safeDecode("100%")).toBe("100%");
  });
});

describe("resolveUrl", () => {
  it("resolves against a base", () => {
    expect(resolveUrl("../api/users", "https://example.com/app/")).toEqual({ ok: true, resolved: "https://example.com/api/users" });
    expect(resolveUrl("//cdn.x.com/a.js", "http://example.com/")).toEqual({ ok: true, resolved: "http://cdn.x.com/a.js" });
  });

  it("needs an absolute base", () => {
    expect(resolveUrl("a", "/app/")).toMatchObject({ ok: false });
  });
});

describe("normalizeUrl", () => {
  it("lowercases the host, drops the default port and resolves dot segments, leaving the query alone", () => {
    expect(normalizeUrl(parsed("HTTPS://Example.COM:443/a/./b/../c?b=2&a=%20+x"))).toBe("https://example.com/a/c?b=2&a=%20+x");
  });

  it("keeps trailing slashes and parameter order", () => {
    expect(normalizeUrl(parsed("https://x.dev/a/?z=1&a=2"))).toBe("https://x.dev/a/?z=1&a=2");
  });

  it("has nothing to do for relative URLs", () => {
    expect(normalizeUrl(parsed("./a"))).toBeNull();
  });
});

describe("draftFrom and buildUrl", () => {
  it("rebuilds the same URL when nothing changed", () => {
    for (const url of [
      "https://ada:p%40ss@api.example.com:8443/users/123?a=%20+x&tag=1&tag=2&flag#details",
      "//cdn.example.com/lib.js?v=2",
      "../images/logo.png?size=2x#top",
    ]) {
      expect(buildUrl(draftFrom(parsed(url))!)).toBe(url);
    }
  });

  it("rebuilds after edits", () => {
    const draft = draftFrom(parsed("https://example.com/a?x=1"))!;
    expect(buildUrl({ ...draft, scheme: "http", hostname: "localhost", port: "3000", pathname: "b", hash: "top" })).toBe(
      "http://localhost:3000/b?x=1#top",
    );
    expect(buildUrl({ ...draft, params: [] })).toBe("https://example.com/a");
  });

  it("has no draft for opaque URLs", () => {
    expect(draftFrom(parsed("mailto:ada@example.com"))).toBeNull();
  });
});

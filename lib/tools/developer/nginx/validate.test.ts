import { describe, expect, it } from "vitest";
import { baseConfig, newLocation, newUpstreamServer, sequentialIds, type Location, type NginxConfig } from "./model";
import { validateConfig } from "./validate";

const makeId = sequentialIds();
const config = (overrides: Partial<NginxConfig> = {}, locations: Partial<Location>[] = [{}]): NginxConfig => ({
  ...baseConfig(),
  upstreamServers: [newUpstreamServer(makeId, "127.0.0.1:3000")],
  locations: locations.map((l) => newLocation(makeId, l)),
  ...overrides,
});
const messages = (overrides?: Partial<NginxConfig>, locations?: Partial<Location>[]) => validateConfig(config(overrides, locations)).map((i) => `${i.level}: ${i.message}`);
const has = (list: string[], pattern: RegExp) => expect(list.some((m) => pattern.test(m)), list.join("\n")).toBe(true);

describe("validateConfig", () => {
  it("passes the defaults", () => {
    expect(messages()).toEqual([]);
  });

  it("checks server names and ports", () => {
    has(messages({ serverNames: "https://example.com" }), /^error: Leave out https:\/\//);
    has(messages({ serverNames: "" }), /^warning: No server name/);
    has(messages({ serverNames: "a.com a.com" }), /listed twice/);
    has(messages({ httpPort: "80a" }), /^error: HTTP port/);
    has(messages({ https: true, httpsPort: "80" }), /^error: HTTP and HTTPS can't use the same port/);
  });

  it("needs certificate paths for HTTPS and warns about a catch-all name", () => {
    has(messages({ https: true, certificate: "" }), /^error: Certificate path is needed/);
    has(messages({ https: true, certificateKey: "key.pem" }), /^error: Certificate key: Use an absolute path/);
    has(messages({ https: true, serverNames: "_" }), /certificate that doesn't match/);
  });

  it("explains HSTS and refuses preload without subdomains", () => {
    has(messages({ https: true, hsts: true }), /^info: HSTS makes browsers refuse plain HTTP/);
    has(messages({ https: true, hsts: true, hstsSubdomains: true }), /every subdomain/);
    has(messages({ https: true, hsts: true, hstsPreload: true }), /^error: HSTS preload requires includeSubDomains/);
    has(messages({ https: true, hsts: true, hstsPreload: true, hstsSubdomains: true }), /^warning: Preload asks browsers/);
    has(messages({ hsts: true }), /^info: HSTS only applies to HTTPS/);
  });

  it("checks the root and index files", () => {
    has(messages({ root: "" }), /^error: Static locations need a document root/);
    has(messages({ root: "www" }), /^error: Document root: Use an absolute path/);
    has(messages({ root: "/home/me/site" }), /^warning: nginx's worker usually can't read/);
    has(messages({ index: "index.html ../x" }), /^error: Index file “..\/x”/);
    expect(messages({ root: "" }, [{ kind: "proxy" }]).some((m) => m.includes("document root"))).toBe(false);
  });

  it("checks upstream servers when a location uses them", () => {
    const proxy = [{ kind: "proxy" as const }];
    has(messages({ upstreamServers: [] }, proxy), /^error: Add at least one upstream server/);
    has(messages({ upstreamServers: [{ ...newUpstreamServer(makeId, "a:1"), backup: true }] }, proxy), /^error: Every upstream server is a backup/);
    has(messages({ upstreamServers: [newUpstreamServer(makeId, "http://a:1")] }, proxy), /^error: Upstream server http:\/\/a:1: Leave out http/);
    has(messages({ upstreamServers: [newUpstreamServer(makeId, "a:1"), newUpstreamServer(makeId, "a:1")] }, proxy), /listed twice/);
    has(messages({ upstreamServers: [{ ...newUpstreamServer(makeId, "a:1"), weight: "0" }] }, proxy), /weight must be a whole number/);
    has(messages({ upstreamName: "my app" }, proxy), /^error: Upstream name/);
    expect(messages({ upstreamServers: [] })).toEqual([]);
  });

  it("checks sizes, timeouts and logs", () => {
    has(messages({ clientMaxBodySize: "10MB" }), /^error: Request body limit/);
    has(messages({ clientMaxBodySize: "0" }), /^warning: A body limit of 0 turns the limit off/);
    has(messages({ proxyReadTimeout: "1 minute" }), /^error: Read timeout/);
    has(messages({ proxyConnectTimeout: "90s" }), /caps the connect timeout at 75s/);
    has(messages({ errorLog: "off" }), /^error: error_log off writes to a file named “off”/);
    has(messages({ accessLog: "logs/a.log" }), /^error: Access log/);
    expect(messages({ accessLog: "off" })).toEqual([]);
  });

  it("checks rate limiting", () => {
    has(messages({ rateLimit: true }), /^warning: Rate limiting is on, but no location uses it/);
    has(messages({ rateLimit: true, rateLimitRate: "10/s" }, [{ rateLimit: true }]), /^error: Rate/);
    has(messages({}, [{ rateLimit: true }]), /set to rate-limit, but rate limiting is off/);
    has(messages({ rateLimit: true }, [{ rateLimit: true }]), /^info: Rate limits count per client IP/);
  });

  it("finds duplicate and malformed locations", () => {
    has(messages({}, [{ path: "/a" }, { path: "/a", match: "preferred" }]), /^error: location \^~ \/a is defined twice/);
    expect(messages({}, [{ path: "/a" }, { path: "/a", match: "exact" }]).filter((m) => !m.startsWith("info"))).toEqual([]);
    has(messages({}, [{ path: "" }]), /has no path/);
    has(messages({}, [{ path: "api" }]), /paths start with \//);
    has(messages({}, [{ match: "regex", path: "(unclosed" }]), /regular expression doesn't look valid/);
    has(messages({}, [{ path: "/$x" }]), /Can't contain \$/);
  });

  it("knows proxy_pass rules", () => {
    has(messages({}, [{ match: "regex", path: "^/api", kind: "proxy", proxyTarget: "http://127.0.0.1:3000/" }]), /doesn't allow a path in proxy_pass inside a regex location/);
    has(messages({}, [{ match: "regex", path: "^/api", kind: "proxy", proxyPath: "/" }]), /doesn't allow a path/);
    has(messages({}, [{ path: "/api/", kind: "proxy", proxyTarget: "http://127.0.0.1:3000/v1" }]), /^warning: .*\/apiusers/);
    expect(messages({}, [{ path: "/api/", kind: "proxy", proxyTarget: "http://127.0.0.1:3000/v1/" }]).filter((m) => !m.startsWith("info"))).toEqual([]);
    has(messages({}, [{ kind: "proxy", proxyTarget: "localhost:3000" }]), /Use a URL starting with http/);
    has(messages({}, [{ kind: "proxy" }]), /^info: X-Forwarded-For adds the client's address/);
    has(messages({ proxyReadTimeout: "30s" }, [{ kind: "proxy", websocket: true }]), /WebSocket connections close after 30s/);
  });

  it("explains the SPA fallback and permanent redirects", () => {
    has(messages({}, [{ kind: "spa" }]), /^info: location \/: every unknown path gets index.html with status 200/);
    has(messages({}, [{ path: "/app/", kind: "spa" }]), /usually on location \//);
    has(messages({}, [{ kind: "redirect" }]), /where should it redirect to/);
    has(messages({}, [{ kind: "redirect", redirectTo: "/new" }]), /browsers cache permanent \(301\)/);
    expect(messages({}, [{ kind: "redirect", redirectTo: "/new", redirectCode: "302" }])).toEqual([]);
  });

  it("notes that host names are resolved at start-up", () => {
    has(messages({}, [{ kind: "proxy", proxyTarget: "http://api.internal:8080" }]), /^info: nginx looks up api.internal once, when it starts/);
    has(messages({ upstreamServers: [newUpstreamServer(makeId, "app:3000")] }, [{ kind: "proxy" }]), /looks up app once/);
    expect(messages({}, [{ kind: "proxy" }]).some((m) => m.includes("looks up"))).toBe(false);
  });

  it("ties issues to their location or upstream server", () => {
    const c = config({}, [{ path: "api" }]);
    expect(validateConfig(c)[0]).toMatchObject({ level: "error", locationId: c.locations[0].id });
  });
});

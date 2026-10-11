import { describe, expect, it } from "vitest";
import { literalError, nginxValue, pathError, portError, proxyUrlError, quoted, rateError, redirectError, serverNameError, sizeError, timeError, upstreamAddressError } from "./syntax";

describe("nginxValue", () => {
  it.each(["/var/www/site", "127.0.0.1:3000", "index.html", "/assets/", "~*", "http://app/"])("leaves %s bare", (v) => {
    expect(nginxValue(v)).toBe(v);
  });

  it.each([
    ["", '""'],
    ["/var/www/my site", '"/var/www/my site"'],
    ["a;b", '"a;b"'],
    ["{x}", '"{x}"'],
    ["#comment", '"#comment"'],
    ['say "hi"', '"say \\"hi\\""'],
    ["\\.(css|js)$", '"\\\\.(css|js)$"'],
    ["^/a{2,3}$", '"^/a{2,3}$"'],
  ])("quotes %j as %s", (v, expected) => {
    expect(nginxValue(v)).toBe(expected);
  });

  it("always quotes with quoted()", () => {
    expect(quoted("nosniff")).toBe('"nosniff"');
  });
});

describe("validators", () => {
  it("checks server names", () => {
    for (const ok of ["example.com", "www.example.com", "*.example.com", ".example.com", "_", "localhost", "192.168.1.10", "xn--bcher-kva.example"]) expect(serverNameError(ok), ok).toBeNull();
    expect(serverNameError("https://example.com")).toBe("Leave out https://: server_name takes just the domain.");
    expect(serverNameError("example.com:8080")).toMatch(/Leave out paths and ports/);
    expect(serverNameError("ex ample")).toMatch(/isn't a domain name/);
    expect(serverNameError("-bad.com")).toMatch(/isn't a domain name/);
    expect(serverNameError("~^www\\d+")).toMatch(/Regex server names/);
  });

  it("checks ports, paths, sizes, times and rates", () => {
    expect(portError("443")).toBeNull();
    expect(portError("0")).not.toBeNull();
    expect(portError("70000")).not.toBeNull();
    expect(pathError("/etc/ssl/cert.pem")).toBeNull();
    expect(pathError("certs/cert.pem")).toBe("Use an absolute path, starting with /.");
    expect(pathError("/var/www/$host")).toMatch(/Can't contain \$/);
    expect(literalError("a\nb")).toBe("Must be on one line.");
    expect(sizeError("10m")).toBeNull();
    expect(sizeError("10 MB")).not.toBeNull();
    expect(timeError("60s")).toBeNull();
    expect(timeError("1m30s")).toBeNull();
    expect(timeError("soon")).not.toBeNull();
    expect(rateError("10r/s")).toBeNull();
    expect(rateError("600r/m")).toBeNull();
    expect(rateError("10/s")).not.toBeNull();
    expect(rateError("0r/s")).not.toBeNull();
  });

  it("checks upstream addresses and proxy URLs", () => {
    for (const ok of ["127.0.0.1:3000", "app:8080", "localhost", "[::1]:3000", "unix:/run/app.sock"]) expect(upstreamAddressError(ok), ok).toBeNull();
    expect(upstreamAddressError("http://app:3000")).toBe("Leave out http://: upstream servers are host:port.");
    expect(upstreamAddressError("::1:3000")).toMatch(/brackets/);
    expect(upstreamAddressError("app:99999")).not.toBeNull();
    expect(proxyUrlError("http://127.0.0.1:3000/api/")).toBeNull();
    expect(proxyUrlError("127.0.0.1:3000")).toMatch(/http:\/\//);
    expect(proxyUrlError("http://$backend")).toMatch(/\$/);
    expect(redirectError("https://example.com/new")).toBeNull();
    expect(redirectError("/new")).toBeNull();
    expect(redirectError("new")).not.toBeNull();
    expect(redirectError("/a; return 200")).not.toBeNull();
  });
});

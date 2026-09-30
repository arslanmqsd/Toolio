import { describe, expect, it } from "vitest";
import { HTTP_STATUSES, STATUS_CLASSES, getStatus, searchStatuses, statusClass } from "./http-status";

const codes = (query: string, cls?: number) => searchStatuses(query, cls).map((s) => s.code);

describe("HTTP_STATUSES data", () => {
  it("has unique codes in ascending order", () => {
    const list = HTTP_STATUSES.map((s) => s.code);
    expect(new Set(list).size).toBe(list.length);
    expect([...list].sort((a, b) => a - b)).toEqual(list);
  });

  it("covers every class", () => {
    for (const cls of [1, 2, 3, 4, 5]) expect(HTTP_STATUSES.some((s) => statusClass(s.code) === cls)).toBe(true);
    expect(STATUS_CLASSES.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("includes the requested codes", () => {
    const required = [
      100, 101, 102, 103, 200, 201, 202, 203, 204, 205, 206, 207, 300, 301, 302, 303, 304, 307, 308,
      ...Array.from({ length: 19 }, (_, i) => 400 + i),
      421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
      ...Array.from({ length: 9 }, (_, i) => 500 + i),
      510, 511, 444, 499, 520, 521, 522, 523, 524, 525, 526,
    ];
    for (const code of required) expect(getStatus(code), String(code)).toBeDefined();
  });

  it("uses current RFC 9110 names", () => {
    expect(getStatus(413)?.name).toBe("Content Too Large");
    expect(getStatus(422)?.name).toBe("Unprocessable Content");
    expect(getStatus(404)?.name).toBe("Not Found");
    expect(getStatus(418)?.name).toBe("I'm a teapot");
    expect(getStatus(429)?.name).toBe("Too Many Requests");
  });

  it("has well-formed spec links and complete text", () => {
    for (const s of HTTP_STATUSES) {
      expect(s.summary.length, `${s.code} summary`).toBeGreaterThan(10);
      expect(s.seenWhen.length, `${s.code} seenWhen`).toBeGreaterThan(10);
      expect(s.whatToDo.length, `${s.code} whatToDo`).toBeGreaterThan(10);
      if (s.source) {
        expect(s.spec, `${s.code} is unofficial`).toBeUndefined();
      } else {
        expect(s.spec?.url, `${s.code} spec`).toMatch(/^https:\/\/www\.rfc-editor\.org\/rfc\/rfc\d+(#section-[\d.]+)?$/);
        expect(s.spec?.label).toMatch(/^RFC \d+/);
      }
    }
  });

  it("marks exactly the RFC 9110 §15.1 codes as cacheable by default", () => {
    const cacheable = HTTP_STATUSES.filter((s) => s.cacheable).map((s) => s.code);
    expect(cacheable).toEqual([200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501]);
  });

  it("marks unofficial codes with their source", () => {
    expect(getStatus(499)?.source).toBe("nginx");
    expect(getStatus(444)?.source).toBe("nginx");
    expect(getStatus(522)?.source).toBe("Cloudflare");
    expect(getStatus(404)?.source).toBeUndefined();
  });
});

describe("searchStatuses", () => {
  it("returns everything for an empty query, optionally filtered by class", () => {
    expect(codes("")).toHaveLength(HTTP_STATUSES.length);
    expect(codes("", 3).every((c) => c >= 300 && c < 400)).toBe(true);
  });

  it("puts an exact code first", () => {
    expect(codes("404")[0]).toBe(404);
    expect(codes(" 502 ")[0]).toBe(502);
  });

  it("matches code prefixes and classes", () => {
    expect(codes("40").every((c) => c >= 400 && c <= 409)).toBe(true);
    expect(codes("5xx").every((c) => c >= 500 && c < 600)).toBe(true);
    expect(codes("5XX")).toEqual(codes("5xx"));
    expect(codes("4").every((c) => c >= 400 && c < 500)).toBe(true);
  });

  it.each([
    ["not found", 404],
    ["rate limit", 429],
    ["rate limited", 429],
    ["too many requests", 429],
    ["teapot", 418],
    ["payload too large", 413],
    ["unprocessable entity", 422],
    ["gateway timeout", 504],
    ["bad gateway", 502],
    ["permanent redirect", 308],
    ["unauthorized", 401],
    ["forbidden", 403],
    ["not modified", 304],
    ["client closed request", 499],
  ])("ranks %j → %d first", (query, code) => {
    expect(codes(query)[0]).toBe(code);
  });

  it("requires every word to match", () => {
    expect(codes("gateway zebra")).toEqual([]);
    expect(codes("xyzzy")).toEqual([]);
  });

  it("combines text search with a class filter", () => {
    expect(codes("timeout", 5)).toContain(504);
    expect(codes("timeout", 5)).not.toContain(408);
  });

  it("is deterministic", () => {
    expect(codes("redirect")).toEqual(codes("redirect"));
  });
});

/**
 * Breaks a URL into its parts with the browser's own URL parser, and rebuilds it after edits. Purely
 * local: nothing here fetches, resolves or opens a URL.
 */

import { parseQuery, serializeQuery, type QueryParam } from "./query-params";

export type UrlType = "absolute" | "relative" | "protocol-relative";

export interface ParsedUrl {
  input: string;
  type: UrlType;
  /** No "//" authority, like mailto:, tel:, javascript: or data:. Everything after the scheme is the pathname. */
  opaque: boolean;
  /** "https:", or "" for relative and protocol-relative URLs. */
  protocol: string;
  /** Percent-encoded, as in the URL. */
  username: string;
  password: string;
  hostname: string;
  port: string;
  /** "" when the scheme has no origin (opaque, file:, relative). */
  origin: string;
  pathname: string;
  /** Pathname split on "/", still percent-encoded. "/a%2Fb/c" is two segments. */
  pathSegments: string[];
  /** With its "?", or "". */
  search: string;
  searchParams: QueryParam[];
  /** With its "#", or "". */
  hash: string;
  /** javascript:, data:, vbscript: or file:. Never render these as links. */
  dangerous: boolean;
}

export type ParseResult = { ok: true; url: ParsedUrl } | { ok: false; error: string };

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const DANGEROUS_SCHEMES = ["javascript:", "data:", "vbscript:", "file:"];
// Only used to check that a relative URL parses; it never appears in the output.
const PLACEHOLDER_BASE = "https://placeholder.invalid/";

export function urlType(text: string): UrlType {
  if (SCHEME.test(text)) return "absolute";
  if (text.startsWith("//")) return "protocol-relative";
  return "relative";
}

/** "/users/123/" → ["users", "123"]. Empty segments in the middle ("a//b") are kept. */
export function pathSegments(pathname: string): string[] {
  if (!pathname.startsWith("/")) return pathname === "" ? [] : pathname.split("/");
  const segments = pathname.slice(1).split("/");
  if (segments[segments.length - 1] === "") segments.pop();
  return segments;
}

/** decodeURIComponent, or the text unchanged if it has a malformed escape. */
export function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** A message that says what's wrong, since the browser's is just "Invalid URL". */
function explainInvalid(text: string): string {
  const authority = text.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1];
  if (authority !== undefined) {
    const host = authority.slice(authority.lastIndexOf("@") + 1);
    if (host === "") return "The host name is missing.";
    if (/\s/.test(host)) return "The host name can't contain spaces.";
    const port = host.match(/:([^:\]]*)$/)?.[1];
    if (port !== undefined && port !== "" && !/^\d+$/.test(port)) return `The port "${port}" must be a number.`;
    if (port && Number(port) > 65535) return `Port ${port} is out of range; ports go up to 65535.`;
    return `"${host}" isn't a valid host name.`;
  }
  if (/^(https?|ftp|wss?):(?!\/\/)/i.test(text)) return `Expected "//" after "${text.match(SCHEME)![0]}".`;
  return "This isn't a valid URL.";
}

export function parseUrl(input: string): ParseResult {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter a URL." };
  // The URL parser silently deletes these, which would show a different URL from the one pasted.
  if (/[\n\r\t]/.test(text)) return { ok: false, error: "URLs can't contain line breaks or tabs." };

  const type = urlType(text);

  if (type === "relative") {
    try {
      new URL(text, PLACEHOLDER_BASE);
    } catch {
      return { ok: false, error: "This isn't a valid relative URL." };
    }
    // Split as written rather than reading back from the resolved URL, which would collapse "../".
    const [, pathname, search = "", hash = ""] = text.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/)!;
    return {
      ok: true,
      url: {
        input: text,
        type,
        opaque: false,
        protocol: "",
        username: "",
        password: "",
        hostname: "",
        port: "",
        origin: "",
        pathname,
        pathSegments: pathSegments(pathname),
        search: search === "?" ? "" : search,
        searchParams: parseQuery(search),
        hash: hash === "#" ? "" : hash,
        dangerous: false,
      },
    };
  }

  let url: URL;
  try {
    url = new URL(type === "protocol-relative" ? `https:${text}` : text);
  } catch {
    return { ok: false, error: explainInvalid(type === "protocol-relative" ? `https:${text}` : text) };
  }

  const opaque = type === "absolute" && url.host === "" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  return {
    ok: true,
    url: {
      input: text,
      type,
      opaque,
      protocol: type === "absolute" ? url.protocol : "",
      username: url.username,
      password: url.password,
      hostname: url.hostname,
      port: url.port,
      origin: type === "absolute" && url.origin !== "null" ? url.origin : "",
      pathname: url.pathname,
      pathSegments: opaque ? [] : pathSegments(url.pathname),
      search: url.search,
      searchParams: parseQuery(url.search),
      hash: url.hash,
      dangerous: DANGEROUS_SCHEMES.includes(url.protocol),
    },
  };
}

/** Resolves a relative or protocol-relative URL against a base, as a browser would. */
export function resolveUrl(relative: string, base: string): { ok: true; resolved: string } | { ok: false; error: string } {
  try {
    const baseUrl = new URL(base.trim());
    return { ok: true, resolved: new URL(relative.trim(), baseUrl).href };
  } catch {
    return { ok: false, error: "The base URL must be an absolute URL, like https://example.com/app/." };
  }
}

/**
 * The URL the way browsers read it: scheme and host lowercased, default port dropped, "." and ".."
 * segments resolved, and characters that must be escaped percent-encoded. Existing escapes, the
 * query's order and its values are left as written. Null for relative URLs, which have nothing to
 * normalize against.
 */
export function normalizeUrl(url: ParsedUrl): string | null {
  if (url.type === "relative") return null;
  const href = new URL(url.type === "protocol-relative" ? `https:${url.input}` : url.input).href;
  return url.type === "protocol-relative" ? href.slice("https:".length) : href;
}

/** The editable parts of a URL. Values are as written in the URL, still percent-encoded, except params. */
export interface UrlDraft {
  type: UrlType;
  /** Without the ":". */
  scheme: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  params: QueryParam[];
  /** Without the "#". */
  hash: string;
}

/** Null for opaque URLs like mailto:, which have no host or path to edit. */
export function draftFrom(url: ParsedUrl): UrlDraft | null {
  if (url.opaque) return null;
  return {
    type: url.type,
    scheme: url.protocol.replace(/:$/, ""),
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    params: url.searchParams,
    hash: url.hash.replace(/^#/, ""),
  };
}

/** Puts a draft back together without validating it, so a half-typed field still shows what it makes. */
export function buildUrl(draft: UrlDraft): string {
  const query = draft.params.length > 0 ? `?${serializeQuery(draft.params)}` : "";
  const hash = draft.hash ? `#${draft.hash}` : "";
  if (draft.type === "relative") return draft.pathname + query + hash;

  const credentials = draft.username || draft.password ? `${draft.username}${draft.password ? `:${draft.password}` : ""}@` : "";
  const port = draft.port ? `:${draft.port}` : "";
  const path = draft.pathname && !draft.pathname.startsWith("/") ? `/${draft.pathname}` : draft.pathname;
  const authority = `//${credentials}${draft.hostname}${port}`;
  return (draft.type === "absolute" ? `${draft.scheme}:` : "") + authority + path + query + hash;
}

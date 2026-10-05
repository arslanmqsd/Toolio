/**
 * Query parameters that remember how they were written. Decoding goes through URLSearchParams; the
 * raw text is kept so rebuilding a URL after one edit leaves every other parameter byte-for-byte as
 * it was. Re-serializing with URLSearchParams would turn %20 into + and re-encode ~ ' ( ) and more.
 */

export interface QueryParam {
  /** As written in the URL, still percent-encoded. */
  rawKey: string;
  rawValue: string;
  /** False for "?flag" (no "="), true for "?flag=" (empty value). Both are kept as written. */
  hasEquals: boolean;
  /** Decoded the way servers read form-encoded queries: escapes decoded and "+" read as a space. */
  key: string;
  value: string;
}

/** Splits a query string (with or without the leading "?") into its pairs, duplicates and empties included. */
export function parseQuery(search: string): QueryParam[] {
  const query = search.startsWith("?") ? search.slice(1) : search;
  // URLSearchParams skips empty pieces ("a=1&&b=2") the same way, so the two lists line up.
  const pieces = query.split("&").filter((piece) => piece !== "");
  const decoded = [...new URLSearchParams(query)];
  return pieces.map((piece, i) => {
    const eq = piece.indexOf("=");
    const [key, value] = decoded[i];
    return eq === -1
      ? { rawKey: piece, rawValue: "", hasEquals: false, key, value }
      : { rawKey: piece.slice(0, eq), rawValue: piece.slice(eq + 1), hasEquals: true, key, value };
  });
}

/** The query string without its "?". */
export function serializeQuery(params: readonly QueryParam[]): string {
  return params.map((p) => (p.hasEquals ? `${p.rawKey}=${p.rawValue}` : p.rawKey)).join("&");
}

export function createParam(key = "", value = ""): QueryParam {
  return { rawKey: encodeURIComponent(key), rawValue: encodeURIComponent(value), hasEquals: true, key, value };
}

/** Sets a decoded key or value, re-encoding only the part that changed. */
export function updateParam(param: QueryParam, change: { key?: string; value?: string }): QueryParam {
  const next = { ...param };
  if (change.key !== undefined && change.key !== param.key) {
    next.key = change.key;
    next.rawKey = encodeURIComponent(change.key);
  }
  if (change.value !== undefined && change.value !== param.value) {
    next.value = change.value;
    next.rawValue = encodeURIComponent(change.value);
    next.hasEquals = true;
  }
  return next;
}

/** Orders by decoded key, keeping repeated keys in their original order. Opt-in only: order can matter to servers. */
export function sortParams(params: readonly QueryParam[]): QueryParam[] {
  return [...params].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** For each param, its occurrence among params with the same key, e.g. "2 of 3". Null when the key appears once. */
export function occurrences(params: readonly QueryParam[]): ({ n: number; of: number } | null)[] {
  const totals = new Map<string, number>();
  for (const p of params) totals.set(p.key, (totals.get(p.key) ?? 0) + 1);
  const seen = new Map<string, number>();
  return params.map((p) => {
    const of = totals.get(p.key)!;
    if (of === 1) return null;
    const n = (seen.get(p.key) ?? 0) + 1;
    seen.set(p.key, n);
    return { n, of };
  });
}

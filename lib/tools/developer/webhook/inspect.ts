/** A JSON payload as a flat list of fields, with paths to copy and hints about what values look like. */

import type { JsonNode } from "@/lib/tools/developer/json-format";

export type PathStyle = "js" | "jsonpath";
export type Segment = string | number;

export interface FieldRow {
  id: string;
  path: Segment[];
  depth: number;
  type: JsonNode["type"];
  /** Scalars: the value as written. Containers: "{3}" or "[12]". */
  preview: string;
  /** Children of an object or array. */
  count?: number;
  /** What a value seems to be: "Unix time, 2023-11-14 22:13:20 UTC", "UUID". */
  hint?: string;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** "data.object.amount", "items[0]['content-type']" or $.data.object.amount. */
export function formatPath(path: Segment[], style: PathStyle): string {
  let out = style === "jsonpath" ? "$" : "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else if (IDENTIFIER.test(seg)) out += out ? `.${seg}` : seg;
    else out += style === "jsonpath" ? `['${seg.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}']` : `[${JSON.stringify(seg)}]`;
  }
  return out || (style === "jsonpath" ? "$" : "(root)");
}

const UNIX_MIN = 978_307_200; // 2001-01-01
const UNIX_MAX = 4_102_444_800; // 2100-01-01

const isoUtc = (ms: number) => new Date(ms).toISOString().replace("T", " ").replace(/\.000Z$|Z$/, " UTC");

/** A short note on what a scalar looks like, for the common things webhooks carry. */
export function valueHint(node: JsonNode): string | undefined {
  if (node.type === "number" && /^\d+$/.test(node.raw)) {
    const n = Number(node.raw);
    if (n >= UNIX_MIN && n < UNIX_MAX) return `Unix time? ${isoUtc(n * 1000)}`;
    if (n >= UNIX_MIN * 1000 && n < UNIX_MAX * 1000) return `Unix time in ms? ${isoUtc(n)}`;
    return undefined;
  }
  if (node.type !== "string") return undefined;
  const s = JSON.parse(node.raw) as string;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return "ISO 8601 date";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return "UUID";
  if (/^https?:\/\/\S+$/.test(s)) return "URL";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "Email";
  if (/^-?\d+(\.\d+)?$/.test(s)) return "Number as a string";
  return undefined;
}

export interface Flattened {
  rows: FieldRow[];
  /** True when there were more fields than `limit`. */
  truncated: boolean;
  total: number;
}

/** Every field, depth first, up to `limit` rows. */
export function flatten(root: JsonNode, limit = 2000): Flattened {
  const rows: FieldRow[] = [];
  let total = 0;

  function visit(node: JsonNode, path: Segment[]) {
    total++;
    if (rows.length < limit) {
      const count = node.type === "object" ? node.entries.length : node.type === "array" ? node.items.length : undefined;
      rows.push({
        id: JSON.stringify(path),
        path,
        depth: path.length,
        type: node.type,
        preview: node.type === "object" ? `{${count}}` : node.type === "array" ? `[${count}]` : node.raw,
        count,
        hint: valueHint(node),
      });
    }
    if (node.type === "object") node.entries.forEach((e) => visit(e.value, [...path, e.key]));
    else if (node.type === "array") node.items.forEach((item, i) => visit(item, [...path, i]));
  }

  visit(root, []);
  return { rows, truncated: total > rows.length, total };
}

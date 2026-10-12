/**
 * Turns JavaScript object literals and JSON5-style text into strict JSON:
 * single-quoted strings, unquoted property names, trailing commas and
 * comments. Everything else is copied as written, so the strict parser still
 * reports anything this doesn't know how to fix.
 */

import { plural, some } from "@/lib/notices";
import { parseJson } from "./json-format";

export interface RepairCounts {
  singleQuoted: number;
  unquotedKeys: number;
  trailingCommas: number;
  comments: number;
}

const IDENTIFIER = /[A-Za-z_$][\w$]*/y;

/** Index of the next character that isn't whitespace or inside a comment. */
function nextSignificant(text: string, from: number): number {
  let j = from;
  while (j < text.length) {
    const c = text[j];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") j++;
    else if (c === "/" && text[j + 1] === "/") {
      const end = text.indexOf("\n", j);
      j = end === -1 ? text.length : end;
    } else if (c === "/" && text[j + 1] === "*") {
      const end = text.indexOf("*/", j + 2);
      j = end === -1 ? text.length : end + 2;
    } else break;
  }
  return j;
}

export function rewriteJson(text: string): { text: string; counts: RepairCounts } {
  const counts: RepairCounts = { singleQuoted: 0, unquotedKeys: 0, trailingCommas: 0, comments: 0 };
  let out = "";
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      counts.comments++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      counts.comments++;
      continue;
    }

    if (c === '"') {
      // Copy double-quoted strings untouched, skipping over escapes.
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (c === "'") {
      let j = i + 1;
      let body = "";
      while (j < text.length && text[j] !== "'") {
        if (text[j] === "\\") {
          // \' needs no escape in JSON; keep every other escape as written.
          body += text[j + 1] === "'" ? "'" : text.slice(j, j + 2);
          j += 2;
        } else {
          body += text[j] === '"' ? '\\"' : text[j];
          j++;
        }
      }
      if (j >= text.length) {
        // Never closed: leave it for the parser to report.
        out += text.slice(i);
        break;
      }
      out += `"${body}"`;
      i = j + 1;
      counts.singleQuoted++;
      continue;
    }

    IDENTIFIER.lastIndex = i;
    const word = /[A-Za-z_$]/.test(c) ? IDENTIFIER.exec(text)?.[0] : undefined;
    if (word) {
      const isKey = text[nextSignificant(text, i + word.length)] === ":";
      if (isKey) {
        out += `"${word}"`;
        counts.unquotedKeys++;
      } else {
        out += word;
      }
      i += word.length;
      continue;
    }

    if (c === ",") {
      const next = text[nextSignificant(text, i + 1)];
      if (next === "}" || next === "]") {
        counts.trailingCommas++;
        i++;
        continue;
      }
    }

    out += c;
    i++;
  }

  return { text: out, counts };
}

/** The fixed text and what changed, or null when there's nothing this can fix into valid JSON. */
export function repairJson(text: string): { text: string; summary: string } | null {
  const { text: fixed, counts } = rewriteJson(text);
  if (fixed === text || !parseJson(fixed).ok) return null;
  const changes = [
    counts.singleQuoted && `convert ${plural(counts.singleQuoted, "single-quoted string", "single-quoted strings")} to double quotes`,
    counts.unquotedKeys && `quote ${plural(counts.unquotedKeys, "property name", "property names")}`,
    counts.trailingCommas && `remove ${plural(counts.trailingCommas, "trailing comma", "trailing commas")}`,
    counts.comments && `remove ${plural(counts.comments, "comment", "comments")}`,
  ].filter((x): x is string => Boolean(x));
  const summary = some(changes, changes.length);
  return { text: fixed, summary: summary.charAt(0).toUpperCase() + summary.slice(1) };
}

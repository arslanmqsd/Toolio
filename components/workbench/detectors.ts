import { parseCron } from "@/lib/tools/developer/cron";
import { decodeJwt } from "@/lib/tools/developer/jwt";
import type { DataType } from "@/registry/data-types";

/** The subset of data types a raw paste can be recognised as. */
export type PasteType = Extract<DataType, "curl" | "jwt" | "json" | "jsonl" | "cron" | "diff" | "html" | "url" | "text">;

const JWT_SHAPE = /^(?:Bearer\s+)?[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/i;

const GIT_COMMIT_HEADER = /^(?:commit|From) [0-9a-f]{7,40}\b/;
const UNIFIED_HUNK = /^--- .*\r?\n\+\+\+ .*\r?\n@@ /m;

/** `git diff` / `git show` / `git format-patch` output, or any unified diff. */
function isDiff(text: string): boolean {
  if (text.startsWith("diff --git ")) return true;
  if (GIT_COMMIT_HEADER.test(text) && /^diff --git /m.test(text)) return true;
  return UNIFIED_HUNK.test(text);
}

/** Two or more lines that each hold one JSON object or array. Bad lines still count, so a broken file is recognised too. */
function isJsonl(text: string): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || !lines.every((line) => /^(?:\{.*\}|\[.*\])$/.test(line))) return false;
  return lines.some((line) => {
    try {
      JSON.parse(line);
      return true;
    } catch {
      return false;
    }
  });
}

const HTML_DOCUMENT = /^(?:<!doctype html|<html[\s>])/i;
// Opens with a tag and closes with one, like "<p>…</p>" or "<div><img src=x></div>".
const HTML_FRAGMENT = /^<[a-z][a-z0-9-]*(?:\s[^>]*)?>[\s\S]*<\/[a-z][a-z0-9-]*>$/i;

/** Guesses what a pasted snippet is so tools can offer to open it. */
export function detectType(pastedText: string): PasteType {
  const text = pastedText.trim();
  if (!text) return "text";

  // Terminal copies often keep the prompt: "$ curl …".
  if (/^(?:\$\s+)?curl\s/.test(text)) return "curl";

  if (isDiff(text)) return "diff";

  // One web address on its own; anything around it makes it text that mentions a URL.
  if (/^https?:\/\/[^\s/?#]+[^\s]*$/i.test(text)) return "url";

  // Dotted strings like hostnames and version numbers share the shape, so the header must decode to JSON.
  if (JWT_SHAPE.test(text)) {
    const result = decodeJwt(text);
    if (result.ok && isObject(result.jwt.header)) return "jwt";
  }

  // Five plain numbers could be anything, so a cron line needs a macro, a * or a step.
  if (!text.includes("\n") && /^@|[*/]/.test(text) && parseCron(text).ok) return "cron";

  // Bare numbers, strings and booleans are valid JSON too, but pasting "42" isn't asking for a JSON tool.
  if (/^[[{]/.test(text)) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      // Not one JSON document; it may be JSON Lines. Otherwise malformed JSON is still text.
      if (isJsonl(text)) return "jsonl";
    }
  }

  if (HTML_DOCUMENT.test(text) || HTML_FRAGMENT.test(text)) return "html";

  return "text";
}

function isObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

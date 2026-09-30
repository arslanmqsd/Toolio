import { decodeJwt } from "@/lib/tools/developer/jwt";
import type { DataType } from "@/registry/data-types";

/** The subset of data types a raw paste can be recognised as. */
export type PasteType = Extract<DataType, "curl" | "jwt" | "json" | "text">;

const JWT_SHAPE = /^(?:Bearer\s+)?[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/i;

/** Guesses what a pasted snippet is so tools can offer to open it. */
export function detectType(pastedText: string): PasteType {
  const text = pastedText.trim();
  if (!text) return "text";

  // Terminal copies often keep the prompt: "$ curl …".
  if (/^(?:\$\s+)?curl\s/.test(text)) return "curl";

  // Dotted strings like hostnames and version numbers share the shape, so the header must decode to JSON.
  if (JWT_SHAPE.test(text)) {
    const result = decodeJwt(text);
    if (result.ok && isObject(result.jwt.header)) return "jwt";
  }

  // Bare numbers, strings and booleans are valid JSON too, but pasting "42" isn't asking for a JSON tool.
  if (/^[[{]/.test(text)) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      // Fall through: malformed JSON is still text.
    }
  }

  return "text";
}

function isObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads text from a format without types (CSV cells, XML text) as a JSON value. Shared so every
 * converter guesses the same way.
 */
import type { JsonNode } from "@/lib/tools/developer/json-format";

// Leading zeros, a leading +, exponents and thousands separators stay strings: 007, +1, 1e5 and
// 1,000 are usually codes or text, and a plain number would have been written otherwise.
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

export const stringNode = (value: string): JsonNode => ({ type: "string", raw: JSON.stringify(value) });

/**
 * Numbers, true/false and null as JSON values, anything else as a string. An integer too large
 * for JavaScript to read exactly stays a string and is added to `bigNumbers`.
 */
export function inferScalar(text: string, bigNumbers: string[]): JsonNode {
  if (/^(true|false)$/i.test(text)) return { type: "boolean", raw: text.toLowerCase() as "true" | "false" };
  if (/^null$/i.test(text)) return { type: "null", raw: "null" };
  if (NUMBER.test(text)) {
    if (text.includes(".") || Number.isSafeInteger(Number(text))) return { type: "number", raw: text };
    bigNumbers.push(text);
  }
  return stringNode(text);
}

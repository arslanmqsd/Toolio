/**
 * Tidies text pasted from PDFs, Word, web pages and chats: invisible characters, odd spaces,
 * curly quotes, stray whitespace, blank and repeated lines. Line endings always become \n.
 */

export interface CleanOptions {
  /** Drop zero-width characters, BOMs and soft hyphens; turn non-breaking and other Unicode spaces into plain spaces. */
  invisible: boolean;
  /** Curly quotes to straight, en and em dashes to "-", "…" to "...". */
  plainPunctuation: boolean;
  trimLines: boolean;
  /** Runs of spaces and tabs inside a line become one space. */
  collapseSpaces: boolean;
  blankLines: "keep" | "squeeze" | "remove";
  dedupeLines: boolean;
  /** Unwrap hard-wrapped lines (as copied from a PDF); blank lines still split paragraphs. */
  joinLines: boolean;
}

export const DEFAULT_CLEAN: CleanOptions = {
  invisible: true,
  plainPunctuation: false,
  trimLines: true,
  collapseSpaces: true,
  blankLines: "squeeze",
  dedupeLines: false,
  joinLines: false,
};

// Zero-width space/joiners, word joiner, BOM, soft hyphen, and bidi marks that show nothing.
const INVISIBLE = /[​-‏⁠﻿­‪-‮⁦-⁩]/g;
// No-break, en/em, thin, hair, ideographic and other spaces that look like " " but aren't.
const ODD_SPACES = /[   -   　]/g;

const PUNCTUATION: [RegExp, string][] = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[–—−]/g, "-"],
  [/…/g, "..."],
];

export function cleanText(text: string, o: CleanOptions): string {
  let out = text.replace(/\r\n?/g, "\n");
  if (o.invisible) out = out.replace(INVISIBLE, "").replace(ODD_SPACES, " ");
  if (o.plainPunctuation) for (const [from, to] of PUNCTUATION) out = out.replace(from, to);

  let lines = out.split("\n");
  if (o.collapseSpaces) lines = lines.map((l) => l.replace(/[ \t]{2,}/g, " "));
  if (o.trimLines) lines = lines.map((l) => l.trim());

  if (o.dedupeLines) {
    const seen = new Set<string>();
    // Blank lines aren't content, so they're left for the blank-line option to handle.
    lines = lines.filter((l) => l.trim() === "" || (!seen.has(l) && seen.add(l)));
  }

  if (o.joinLines) {
    // Blank lines still separate paragraphs; everything else becomes one line per paragraph.
    const paragraphs = lines.join("\n").split(/\n\s*\n/).map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean).join(" "));
    lines = paragraphs.filter(Boolean).flatMap((p, i) => (i === 0 || o.blankLines === "remove" ? [p] : ["", p]));
  } else if (o.blankLines === "remove") {
    lines = lines.filter((l) => l.trim() !== "");
  } else if (o.blankLines === "squeeze") {
    lines = lines.filter((l, i) => l.trim() !== "" || (i > 0 && lines[i - 1].trim() !== ""));
  }

  out = lines.join("\n");
  return o.blankLines === "keep" ? out : out.replace(/^\n+|\n+$/g, "");
}

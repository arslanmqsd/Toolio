import type { Hunk, WordRange } from "./model";

/** A run of text with its highlight.js classes. `changed` marks a changed word inside a changed line. */
export interface Piece {
  text: string;
  classes: string[];
  changed?: boolean;
}

/** Turns code into pieces; the diff tools pass highlight.js through parseHighlighted. */
export type Highlight = (code: string) => Piece[];

/** Highlighted pieces for each line, by line number, on each side. */
export interface SideHighlights {
  old: Map<number, Piece[]>;
  new: Map<number, Piece[]>;
}

/** Above this many lines the diff tools skip syntax colors: highlighting would slow typing down. */
export const HIGHLIGHT_LINE_LIMIT = 5000;

export function plainPieces(text: string): Piece[] {
  return text ? [{ text, classes: [] }] : [];
}

/** Splits pieces where changed-word ranges start and end, and flags the pieces inside a range. */
export function markChanged(pieces: Piece[], ranges: WordRange[]): Piece[] {
  if (ranges.length === 0) return pieces;
  const cuts = [...new Set(ranges.flatMap((r) => [r.start, r.end]))].sort((a, b) => a - b);
  const inRange = (at: number) => ranges.some((r) => at >= r.start && at < r.end);

  const out: Piece[] = [];
  let pos = 0;
  for (const piece of pieces) {
    const end = pos + piece.text.length;
    const points = [...cuts.filter((c) => c > pos && c < end), end];
    let from = pos;
    for (const to of points) {
      out.push({ ...piece, text: piece.text.slice(from - pos, to - pos), changed: inRange(from) });
      from = to;
    }
    pos = end;
  }
  return out;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'" };
const TOKEN = /<span class="([^"]*)">|<\/span>|&(?:amp|lt|gt|quot|#x27);|[^<&]+|[<&]/g;

/**
 * Reads highlight.js output into pieces, so it renders as React text instead of injected HTML. highlight.js only
 * writes class spans and five escapes; anything else means the input isn't its output, so this throws.
 */
export function parseHighlighted(html: string): Piece[] {
  const out: Piece[] = [];
  const open: string[][] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ text, classes: open.flat() });
    text = "";
  };

  for (const match of html.matchAll(TOKEN)) {
    const token = match[0];
    if (match[1] !== undefined) {
      flush();
      open.push(match[1].split(" ").filter(Boolean));
    } else if (token === "</span>") {
      flush();
      if (!open.pop()) throw new Error("Unbalanced </span> in highlighted code.");
    } else if (token in ENTITIES) {
      text += ENTITIES[token];
    } else if (token === "<" || token === "&") {
      throw new Error(`Unexpected markup at ${match.index} in highlighted code.`);
    } else {
      text += token;
    }
  }
  flush();
  return out;
}

/** Splits pieces into lines. A piece spanning lines (a block comment) keeps its classes on every line. */
export function piecesByLine(pieces: Piece[]): Piece[][] {
  const lines: Piece[][] = [[]];
  for (const piece of pieces) {
    piece.text.split("\n").forEach((text, i) => {
      if (i > 0) lines.push([]);
      if (text) lines[lines.length - 1].push({ ...piece, text });
    });
  }
  return lines;
}

/**
 * Highlights each hunk's old side and new side as whole blocks (so multi-line comments and strings color
 * correctly), then indexes the pieces by line number.
 */
export function highlightHunks(hunks: Hunk[], highlight: Highlight): SideHighlights {
  const result: SideHighlights = { old: new Map(), new: new Map() };
  for (const hunk of hunks) {
    for (const side of ["old", "new"] as const) {
      const lines = hunk.rows.flatMap((row) => {
        const no = side === "old" ? row.oldNo : row.newNo;
        if (no === undefined) return [];
        return [{ no, text: side === "old" ? (row.oldText ?? row.text) : row.text }];
      });
      if (lines.length === 0) continue;
      const byLine = piecesByLine(highlight(lines.map((line) => line.text).join("\n")));
      lines.forEach((line, i) => result[side].set(line.no, byLine[i] ?? []));
    }
  }
  return result;
}

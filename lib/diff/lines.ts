/** Splits text into lines on LF or CRLF. A final newline ends the last line rather than starting an empty one. */
export function splitLines(text: string): { lines: string[]; endsWithNewline: boolean } {
  if (text === "") return { lines: [], endsWithNewline: false };
  const lines = text.split(/\r\n|\n/);
  const endsWithNewline = lines[lines.length - 1] === "";
  if (endsWithNewline) lines.pop();
  return { lines, endsWithNewline };
}

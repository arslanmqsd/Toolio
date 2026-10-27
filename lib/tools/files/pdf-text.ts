/** A run of text on a PDF page, as pdf.js reports it, in page units with y going up. */
export interface TextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** pdf.js's own "a line ends here" mark. */
  hasEOL: boolean;
}

/**
 * Plain text from one page's runs, in the order the PDF stores them (usually reading order). A drop to a
 * lower line starts a new line; a drop of nearly two lines or more leaves a blank line, for paragraphs;
 * runs on one line that sit apart get a space between them.
 */
export function runsToText(runs: TextRun[]): string {
  let out = "";
  let prev: TextRun | null = null;
  let eol = false;
  for (const run of runs) {
    if (run.str) {
      if (prev) {
        const lineHeight = Math.max(prev.height, run.height) || 10;
        const drop = prev.y - run.y;
        if (eol || Math.abs(drop) > lineHeight * 0.5) {
          out = out.trimEnd() + "\n";
          if (drop > lineHeight * 1.8) out += "\n";
        } else if (run.x - (prev.x + prev.width) > lineHeight * 0.15 && !/\s$/.test(out) && !/^\s/.test(run.str)) {
          out += " ";
        }
      }
      out += run.str;
      prev = run;
      eol = false;
    }
    if (run.hasEOL) eol = true;
  }
  return out
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/** All pages' text, separated by a blank line, or by a "--- Page 3 ---" line when `markPages` is on. */
export function joinPages(pages: { page: number; text: string }[], markPages: boolean): string {
  if (!markPages) return pages.map((p) => p.text).filter(Boolean).join("\n\n");
  return pages.map((p) => `--- Page ${p.page} ---\n${p.text}`.trimEnd()).join("\n\n");
}

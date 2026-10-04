import { diffWordsWithSpace } from "diff";
import type { Row, WordRange } from "./model";

/** Longer lines get no word marks: word-diffing them is slow and the marks are unreadable anyway. */
export const MAX_WORD_DIFF_LENGTH = 1000;
/** Share of the longer line's non-space characters two lines must have in common to get word marks. */
const MIN_SHARED = 0.4;

const visibleLength = (text: string) => text.replace(/\s/g, "").length;

/** The changed stretches of a removed line and the added line that replaced it, or null when marks wouldn't help. */
export function wordRanges(oldText: string, newText: string): { old: WordRange[]; new: WordRange[] } | null {
  if (oldText.length > MAX_WORD_DIFF_LENGTH || newText.length > MAX_WORD_DIFF_LENGTH) return null;

  const old: WordRange[] = [];
  const added: WordRange[] = [];
  let oldPos = 0;
  let newPos = 0;
  let shared = 0;
  for (const part of diffWordsWithSpace(oldText, newText)) {
    const length = part.value.length;
    if (part.removed) {
      old.push({ start: oldPos, end: oldPos + length });
      oldPos += length;
    } else if (part.added) {
      added.push({ start: newPos, end: newPos + length });
      newPos += length;
    } else {
      oldPos += length;
      newPos += length;
      shared += visibleLength(part.value);
    }
  }

  const longer = Math.max(visibleLength(oldText), visibleLength(newText));
  if (longer > 0 && shared / longer < MIN_SHARED) return null;
  return { old, new: added };
}

/**
 * Pairs each run of removed rows directly followed by added rows, first with first, and gives each pair its
 * changed-word ranges. Rows without a partner stay as they are. Returns new row objects.
 */
export function pairChanges(rows: Row[]): Row[] {
  const out = rows.map((row) => ({ ...row }));
  let i = 0;
  while (i < out.length) {
    if (out[i].kind !== "remove") {
      i++;
      continue;
    }
    let removedEnd = i;
    while (removedEnd < out.length && out[removedEnd].kind === "remove") removedEnd++;
    let addedEnd = removedEnd;
    while (addedEnd < out.length && out[addedEnd].kind === "add") addedEnd++;

    const pairs = Math.min(removedEnd - i, addedEnd - removedEnd);
    for (let k = 0; k < pairs; k++) {
      const ranges = wordRanges(out[i + k].text, out[removedEnd + k].text);
      if (ranges) {
        out[i + k].words = ranges.old;
        out[removedEnd + k].words = ranges.new;
      }
    }
    i = addedEnd;
  }
  return out;
}

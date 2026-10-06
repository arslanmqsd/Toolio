import { captureGroupNames } from "./regex-explain";

export interface GroupMatch {
  index: number;
  name?: string;
  /** Undefined when the group didn't take part in the match. */
  value?: string;
  start?: number;
  end?: number;
}

export interface RegexMatch {
  start: number;
  end: number;
  value: string;
  groups: GroupMatch[];
}

export interface MatchResult {
  matches: RegexMatch[];
  /** True when matching stopped at the limit. */
  truncated: boolean;
}

export const MATCH_LIMIT = 1000;

/** Runs the pattern over `text` the way String.prototype.matchAll would (or exec once without g). */
export function findMatches(pattern: string, flags: string, text: string, limit = MATCH_LIMIT): MatchResult {
  const re = new RegExp(pattern, flags.includes("d") ? flags : `${flags}d`);
  const names = captureGroupNames(pattern);

  const toMatch = (m: RegExpExecArray): RegexMatch => ({
    start: m.index,
    end: m.index + m[0].length,
    value: m[0],
    groups: m.slice(1).map((value, k) => ({
      index: k + 1,
      name: names[k],
      value,
      start: m.indices?.[k + 1]?.[0],
      end: m.indices?.[k + 1]?.[1],
    })),
  });

  if (!re.global) {
    const m = re.exec(text);
    return { matches: m ? [toMatch(m)] : [], truncated: false };
  }

  const matches: RegexMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (matches.length === limit) return { matches, truncated: true };
    matches.push(toMatch(m));
    // An empty match doesn't move lastIndex; step past it (by a whole code point with u/v).
    if (m[0] === "") {
      const code = text.codePointAt(re.lastIndex);
      re.lastIndex += (re.unicode || re.unicodeSets) && code !== undefined && code > 0xffff ? 2 : 1;
    }
  }
  return { matches, truncated: false };
}

export type MatchRequest = { pattern: string; flags: string; text: string };

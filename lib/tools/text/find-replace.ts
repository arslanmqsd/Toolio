export interface FindReplaceRequest {
  text: string;
  find: string;
  replace: string;
  /** Treat `find` as a regular expression; the replacement then understands $1, $<name>, $& and \n, \t. */
  regex: boolean;
  matchCase: boolean;
  /** Only match where the find text isn't part of a longer word. */
  wholeWord: boolean;
}

export interface FindReplaceResult {
  output: string;
  count: number;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unescapeReplacement = (s: string) => s.replace(/\\([nt\\])/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : "\\"));

/** Throws SyntaxError for an invalid regular expression. */
export function buildFindRegex({ find, regex, matchCase, wholeWord }: Omit<FindReplaceRequest, "text" | "replace">): RegExp {
  const source = regex ? find : escapeRegex(find);
  // \b only knows ASCII letters, so words are bounded by any Unicode letter, digit or underscore.
  const bounded = wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])` : source;
  return new RegExp(bounded, `gmu${matchCase ? "" : "i"}`);
}

export function findReplace(request: FindReplaceRequest): FindReplaceResult {
  const { text, replace, regex } = request;
  // An empty pattern matches between every character, which no one means.
  if (!request.find) return { output: text, count: 0 };
  const re = buildFindRegex(request);
  const count = text.match(re)?.length ?? 0;
  // Plain mode inserts the replacement as typed, so a "$" in it stays a "$".
  const output = regex ? text.replace(re, unescapeReplacement(replace)) : text.replace(re, () => replace);
  return { output, count };
}

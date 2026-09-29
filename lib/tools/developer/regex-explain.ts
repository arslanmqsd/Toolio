/**
 * Parser and plain-English explainer for JavaScript regular expressions,
 * including the legacy (Annex B) syntax browsers accept without the u flag.
 * Callers should validate the pattern with `new RegExp` first; this parser
 * assumes a valid pattern and is lenient where the spec is.
 */

type SetKind = "digit" | "notDigit" | "word" | "notWord" | "space" | "notSpace";

type GroupKind =
  | "capture"
  | "named"
  | "noncapture"
  | "modifiers"
  | "lookahead"
  | "negLookahead"
  | "lookbehind"
  | "negLookbehind";

type ClassItem =
  | { type: "char"; char: string }
  | { type: "range"; from: string; to: string }
  | { type: "set"; kind: SetKind }
  | { type: "property"; negated: boolean; name: string };

interface Span {
  start: number;
  end: number;
}

type RegexNode = Span &
  (
    | { type: "char"; char: string }
    | { type: "any" }
    | { type: "set"; kind: SetKind }
    | { type: "start" | "end" | "wordBoundary" | "notWordBoundary" }
    | { type: "class"; negated: boolean; items: ClassItem[] }
    | { type: "group"; kind: GroupKind; index?: number; name?: string; modifiers?: string; body: Disjunction }
    | { type: "backref"; ref: number | string }
    | { type: "property"; negated: boolean; name: string }
    | { type: "quantified"; term: RegexNode; min: number; max: number; lazy: boolean }
  );

interface Disjunction extends Span {
  alternatives: (Span & { terms: RegexNode[] })[];
}

/** Name of each capture group in order (undefined for unnamed groups). */
export function captureGroupNames(pattern: string): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
    } else if (c === "[") {
      i++;
      if (pattern[i] === "^") i++;
      while (i < pattern.length && pattern[i] !== "]") i += pattern[i] === "\\" ? 2 : 1;
    } else if (c === "(") {
      if (pattern[i + 1] !== "?") names.push(undefined);
      else if (pattern[i + 2] === "<" && pattern[i + 3] !== "=" && pattern[i + 3] !== "!") {
        names.push(pattern.slice(i + 3, pattern.indexOf(">", i)));
      }
    }
  }
  return names;
}

const SET_KINDS: Record<string, SetKind> = {
  d: "digit", D: "notDigit", w: "word", W: "notWord", s: "space", S: "notSpace",
};
const CONTROL_ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", f: "\f", v: "\v" };

export function parseRegex(pattern: string, unicode: boolean): Disjunction {
  const names = captureGroupNames(pattern);
  const hasNamedGroups = names.some((n) => n !== undefined);
  let i = 0;
  let groupIndex = 0;

  const fail = (message: string): never => {
    throw new Error(`${message} at position ${i}.`);
  };

  const readCodePoint = (): string => {
    const ch = unicode ? String.fromCodePoint(pattern.codePointAt(i)!) : pattern[i];
    i += ch.length;
    return ch;
  };

  /** Escapes valid both inside and outside classes. `i` points just after the backslash. */
  function characterEscape(inClass: boolean): ClassItem {
    const c = pattern[i];
    if (c in SET_KINDS) {
      i++;
      return { type: "set", kind: SET_KINDS[c] };
    }
    if (unicode && (c === "p" || c === "P") && pattern[i + 1] === "{") {
      const close = pattern.indexOf("}", i);
      if (close === -1) fail("Unclosed \\p{");
      const name = pattern.slice(i + 2, close);
      i = close + 1;
      return { type: "property", negated: c === "P", name };
    }
    if (c in CONTROL_ESCAPES) {
      i++;
      return { type: "char", char: CONTROL_ESCAPES[c] };
    }
    if (c === "c") {
      const next = pattern[i + 1] ?? "";
      if (/[A-Za-z]/.test(next) || (inClass && !unicode && /[0-9_]/.test(next))) {
        i += 2;
        return { type: "char", char: String.fromCharCode(next.charCodeAt(0) % 32) };
      }
      // Legacy: "\c" not followed by a letter is a literal backslash; the "c" is read next.
      return { type: "char", char: "\\" };
    }
    if (c === "x") {
      const hex = /^[0-9a-fA-F]{2}/.exec(pattern.slice(i + 1));
      if (hex) {
        i += 3;
        return { type: "char", char: String.fromCharCode(parseInt(hex[0], 16)) };
      }
    }
    if (c === "u") {
      if (unicode && pattern[i + 1] === "{") {
        const close = pattern.indexOf("}", i);
        const char = String.fromCodePoint(parseInt(pattern.slice(i + 2, close), 16));
        i = close + 1;
        return { type: "char", char };
      }
      const hex = /^[0-9a-fA-F]{4}/.exec(pattern.slice(i + 1));
      if (hex) {
        i += 5;
        return { type: "char", char: String.fromCharCode(parseInt(hex[0], 16)) };
      }
    }
    if (c === "0" && !/[0-9]/.test(pattern[i + 1] ?? "")) {
      i++;
      return { type: "char", char: "\0" };
    }
    if (!unicode && /[0-7]/.test(c)) {
      const octal = /^(?:[0-3][0-7]{0,2}|[4-7][0-7]?)/.exec(pattern.slice(i))![0];
      i += octal.length;
      return { type: "char", char: String.fromCharCode(parseInt(octal, 8)) };
    }
    if (inClass && c === "b") {
      i++;
      return { type: "char", char: "\b" };
    }
    // Identity escape: the character itself, e.g. \. or \/.
    return { type: "char", char: readCodePoint() };
  }

  function parseClass(): RegexNode {
    const start = i;
    i++;
    const negated = pattern[i] === "^";
    if (negated) i++;
    const items: ClassItem[] = [];

    const atom = (): ClassItem => {
      if (pattern[i] === "\\") {
        i++;
        return characterEscape(true);
      }
      return { type: "char", char: readCodePoint() };
    };

    while (i < pattern.length && pattern[i] !== "]") {
      const from = atom();
      if (pattern[i] === "-" && i + 1 < pattern.length && pattern[i + 1] !== "]") {
        i++;
        const to = atom();
        if (from.type === "char" && to.type === "char") items.push({ type: "range", from: from.char, to: to.char });
        else items.push(from, { type: "char", char: "-" }, to); // legacy: "-" next to \d etc. is literal
      } else {
        items.push(from);
      }
    }
    if (pattern[i] !== "]") fail("Unclosed character class");
    i++;
    return { type: "class", negated, items, start, end: i };
  }

  function parseGroup(): RegexNode {
    const start = i;
    i++;
    let kind: GroupKind = "capture";
    let name: string | undefined;
    let modifiers: string | undefined;
    const rest = pattern.slice(i);
    if (rest.startsWith("?:")) [kind, i] = ["noncapture", i + 2];
    else if (rest.startsWith("?=")) [kind, i] = ["lookahead", i + 2];
    else if (rest.startsWith("?!")) [kind, i] = ["negLookahead", i + 2];
    else if (rest.startsWith("?<=")) [kind, i] = ["lookbehind", i + 3];
    else if (rest.startsWith("?<!")) [kind, i] = ["negLookbehind", i + 3];
    else if (rest.startsWith("?<")) {
      kind = "named";
      const close = pattern.indexOf(">", i);
      name = pattern.slice(i + 2, close);
      i = close + 1;
    } else if (rest.startsWith("?")) {
      const mod = /^\?([ims]*)(?:-([ims]+))?:/.exec(rest);
      if (!mod) fail("Unknown group type");
      kind = "modifiers";
      modifiers = mod![0].slice(1, -1);
      i += mod![0].length;
    }
    const index = kind === "capture" || kind === "named" ? ++groupIndex : undefined;
    const body = parseDisjunction();
    if (pattern[i] !== ")") fail("Unclosed group");
    i++;
    return { type: "group", kind, index, name, modifiers, body, start, end: i };
  }

  function parseAtom(): RegexNode {
    const start = i;
    const c = pattern[i];
    if (c === "^") return { type: "start", start, end: ++i };
    if (c === "$") return { type: "end", start, end: ++i };
    if (c === ".") return { type: "any", start, end: ++i };
    if (c === "(") return parseGroup();
    if (c === "[") return parseClass();
    if (c === "\\") {
      i++;
      const e = pattern[i];
      if (e === "b") return { type: "wordBoundary", start, end: ++i };
      if (e === "B") return { type: "notWordBoundary", start, end: ++i };
      if (/[1-9]/.test(e)) {
        const digits = /^\d+/.exec(pattern.slice(i))![0];
        if (unicode || Number(digits) <= names.length) {
          i += digits.length;
          return { type: "backref", ref: Number(digits), start, end: i };
        }
      }
      if (e === "k" && (unicode || hasNamedGroups) && pattern[i + 1] === "<") {
        const close = pattern.indexOf(">", i);
        const ref = pattern.slice(i + 2, close);
        i = close + 1;
        return { type: "backref", ref, start, end: i };
      }
      return { ...characterEscape(false), start, end: i } as RegexNode;
    }
    return { type: "char", char: readCodePoint(), start, end: i };
  }

  function parseQuantifier(): { min: number; max: number; lazy: boolean } | null {
    let min: number;
    let max: number;
    const c = pattern[i];
    if (c === "*") [min, max, i] = [0, Infinity, i + 1];
    else if (c === "+") [min, max, i] = [1, Infinity, i + 1];
    else if (c === "?") [min, max, i] = [0, 1, i + 1];
    else if (c === "{") {
      const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(pattern.slice(i));
      if (!m) return null; // legacy: a "{" that isn't a quantifier is literal
      min = Number(m[1]);
      max = m[2] ? (m[3] ? Number(m[3]) : Infinity) : min;
      i += m[0].length;
    } else {
      return null;
    }
    const lazy = pattern[i] === "?";
    if (lazy) i++;
    return { min, max, lazy };
  }

  function parseDisjunction(): Disjunction {
    const start = i;
    const alternatives: Disjunction["alternatives"] = [];
    for (;;) {
      const altStart = i;
      const terms: RegexNode[] = [];
      while (i < pattern.length && pattern[i] !== "|" && pattern[i] !== ")") {
        const term = parseAtom();
        const quantifier = parseQuantifier();
        terms.push(quantifier ? { type: "quantified", term, ...quantifier, start: term.start, end: i } : term);
      }
      alternatives.push({ start: altStart, end: i, terms });
      if (pattern[i] !== "|") return { start, end: i, alternatives };
      i++;
    }
  }

  const tree = parseDisjunction();
  if (i < pattern.length) fail("Unmatched )");
  return tree;
}

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

export interface ExplainLine {
  /** The part of the pattern this line describes. */
  source: string;
  text: string;
  children: ExplainLine[];
}

export interface RegexFlags {
  multiline: boolean;
  dotAll: boolean;
}

const SET_TEXT: Record<SetKind, [standalone: string, inList: string]> = {
  digit: ["A digit (0–9)", "a digit"],
  notDigit: ["Any character except a digit", "a non-digit"],
  word: ["A word character (letter, digit, or _)", "a word character"],
  notWord: ["Any character except a word character", "a non-word character"],
  space: ["A whitespace character", "whitespace"],
  notSpace: ["Any character except whitespace", "a non-whitespace character"],
};

const PROPERTY_TEXT: Record<string, string> = {
  L: "a letter", Letter: "a letter", Lu: "an uppercase letter", Uppercase_Letter: "an uppercase letter",
  Ll: "a lowercase letter", Lowercase_Letter: "a lowercase letter", N: "a number", Number: "a number",
  Nd: "a decimal digit", P: "punctuation", Punctuation: "punctuation", S: "a symbol", Symbol: "a symbol",
  Z: "a separator", Zs: "a space separator", Emoji: "an emoji", Emoji_Presentation: "an emoji",
  Extended_Pictographic: "a pictographic symbol (emoji)", Alphabetic: "an alphabetic character",
  White_Space: "whitespace", ASCII: "an ASCII character", Any: "any code point",
};

function propertyText(name: string): string {
  if (name in PROPERTY_TEXT) return PROPERTY_TEXT[name];
  const script = /^(?:Script|sc|Script_Extensions|scx)=(.+)$/.exec(name);
  if (script) return `a ${script[1].replace(/_/g, " ")} script character`;
  return `a character with the Unicode property ${name}`;
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

const quote = (s: string) => JSON.stringify(s);

function quantifierText(min: number, max: number, lazy: boolean): string {
  let text: string;
  if (min === 0 && max === 1) text = "optional";
  else if (min === 0 && max === Infinity) text = "zero or more times";
  else if (min === 1 && max === Infinity) text = "one or more times";
  else if (min === max) text = min === 1 ? "once" : `exactly ${min} times`;
  else if (max === Infinity) text = `at least ${min} times`;
  else text = `between ${min} and ${max} times`;
  return lazy ? `${text}, as few as possible` : text;
}

function classItemText(item: ClassItem): string {
  switch (item.type) {
    case "char":
      return quote(item.char);
    case "range":
      return /^[A-Za-z0-9]$/.test(item.from) && /^[A-Za-z0-9]$/.test(item.to)
        ? `${item.from}–${item.to}`
        : `${quote(item.from)}–${quote(item.to)}`;
    case "set":
      return SET_TEXT[item.kind][1];
    case "property":
      return item.negated ? `anything but ${propertyText(item.name)}` : propertyText(item.name);
  }
}

const GROUP_TEXT: Record<Exclude<GroupKind, "capture" | "named" | "modifiers">, string> = {
  noncapture: "Group",
  lookahead: "Followed by (not included in the match)",
  negLookahead: "Not followed by",
  lookbehind: "Preceded by (not included in the match)",
  negLookbehind: "Not preceded by",
};

export function explainRegex(pattern: string, flags: string): ExplainLine[] {
  const unicode = flags.includes("u") || flags.includes("v");
  const multiline = flags.includes("m");
  const dotAll = flags.includes("s");
  const src = (span: Span) => pattern.slice(span.start, span.end);

  function explainDisjunction(d: Disjunction): ExplainLine[] {
    if (d.alternatives.length === 1) {
      const terms = explainSequence(d.alternatives[0].terms);
      return terms.length ? terms : [{ source: "", text: "Nothing (matches an empty string)", children: [] }];
    }
    return [
      {
        source: src(d),
        text: "Either:",
        children: d.alternatives.map((alt, k) => {
          const children = explainSequence(alt.terms);
          return {
            source: src(alt),
            text: children.length ? `Option ${k + 1}:` : `Option ${k + 1}: nothing (matches an empty string)`,
            children,
          };
        }),
      },
    ];
  }

  function explainSequence(terms: RegexNode[]): ExplainLine[] {
    const lines: ExplainLine[] = [];
    for (let k = 0; k < terms.length; k++) {
      const term = terms[k];
      if (term.type === "char") {
        // Merge runs of plain characters into one line.
        let end = k;
        let text = term.char;
        while (terms[end + 1]?.type === "char") {
          end++;
          text += (terms[end] as { char: string }).char;
        }
        lines.push({ source: pattern.slice(term.start, terms[end].end), text: `The text ${quote(text)}`, children: [] });
        k = end;
      } else {
        lines.push(explainNode(term));
      }
    }
    return lines;
  }

  function explainNode(node: RegexNode): ExplainLine {
    const line = (text: string, children: ExplainLine[] = []): ExplainLine => ({ source: src(node), text, children });
    switch (node.type) {
      case "char":
        return line(`The text ${quote(node.char)}`);
      case "any":
        return line(dotAll ? "Any character" : "Any character except a line break");
      case "set":
        return line(SET_TEXT[node.kind][0]);
      case "start":
        return line(multiline ? "Start of a line" : "Start of the text");
      case "end":
        return line(multiline ? "End of a line" : "End of the text");
      case "wordBoundary":
        return line("A word boundary");
      case "notWordBoundary":
        return line("Not a word boundary");
      case "property":
        return line(node.negated ? `Any character except ${propertyText(node.name)}` : capitalize(propertyText(node.name)));
      case "backref":
        return line(
          typeof node.ref === "number"
            ? `The same text that group #${node.ref} matched`
            : `The same text that group ${quote(node.ref)} matched`,
        );
      case "class": {
        if (node.items.length === 0) {
          return line(node.negated ? "Any character, including line breaks" : "Nothing: an empty class never matches");
        }
        const list = node.items.map(classItemText).join(", ");
        return line(node.negated ? `Any character except ${list}` : `One of: ${list}`);
      }
      case "group": {
        const text =
          node.kind === "capture"
            ? `Capture group #${node.index}`
            : node.kind === "named"
              ? `Capture group ${quote(node.name!)} (#${node.index})`
              : node.kind === "modifiers"
                ? `Group with flags ${node.modifiers}`
                : GROUP_TEXT[node.kind];
        return line(`${text}:`, explainDisjunction(node.body));
      }
      case "quantified": {
        const inner = explainNode(node.term);
        const base = inner.text.replace(/:$/, "");
        const suffix = inner.children.length ? ":" : "";
        return line(`${base}, ${quantifierText(node.min, node.max, node.lazy)}${suffix}`, inner.children);
      }
    }
  }

  return explainDisjunction(parseRegex(pattern, unicode));
}

const FLAG_TEXT: Record<string, string> = {
  g: "Global: find every match, not just the first",
  i: "Ignore case: letters match in upper or lower case",
  m: "Multiline: ^ and $ match at the start and end of each line",
  s: "Dot all: . also matches line breaks",
  u: "Unicode: match whole code points and allow \\p{…}",
  y: "Sticky: each match must start exactly where the last one ended",
  d: "Indices: report where each group matched",
};

export function explainFlags(flags: string): { flag: string; text: string }[] {
  return [...flags].filter((f) => f in FLAG_TEXT).map((flag) => ({ flag, text: FLAG_TEXT[flag] }));
}

/** Plain-text outline of an explanation, for copying. */
export function explanationToText(lines: ExplainLine[], depth = 0): string {
  return lines
    .map((l) => {
      const pad = "  ".repeat(depth);
      const head = l.source ? `${pad}${l.source}  ${l.text}` : `${pad}${l.text}`;
      return l.children.length ? `${head}\n${explanationToText(l.children, depth + 1)}` : head;
    })
    .join("\n");
}

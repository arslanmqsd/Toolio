/**
 * Semantic versions and ranges as npm reads them, using node-semver (the package npm itself uses).
 * Other ecosystems differ: Cargo reads a bare "1.2" as "^1.2", and Python's PEP 440 is another
 * scheme altogether.
 */
import { Comparator, Range, SemVer, coerce, compare, diff, inc, minVersion, rcompare, valid, validRange, type ReleaseType } from "semver";

export type ParsedVersion = { input: string; ok: true; version: string; note?: string } | { input: string; ok: false; error: string };

// node-semver rejects longer strings anyway; checking first gives a clearer message.
const MAX_LENGTH = 256;
// Only fill in missing parts for something that's plainly a short version, like "1.2" or "v1";
// coerce alone would read "foo1.2.3" as 1.2.3.
const SHORT_VERSION = /^[v=]*\d+(\.\d+)?$/i;

/** One version, read loosely: "v1.2.3", "=1.2.3" and "1.2" are all accepted. */
export function parseVersion(raw: string): ParsedVersion {
  const input = raw.trim();
  if (input === "") return { input, ok: false, error: "Empty" };
  if (input.length > MAX_LENGTH) return { input, ok: false, error: `Longer than ${MAX_LENGTH} characters` };

  if (valid(input, { loose: true })) {
    // From the input, not valid()'s result, which drops the build metadata.
    const version = new SemVer(input, { loose: true });
    const notes: string[] = [];
    // A leading v or = is common enough not to need a note; anything else read differently does.
    if (input.replace(/^[v=\s]+/i, "").split("+")[0] !== version.version) notes.push(`Read as ${version.version}`);
    if (version.build.length > 0) notes.push("Build metadata (after +) doesn't count when comparing");
    return { input, ok: true, version: version.version, ...(notes.length ? { note: notes.join(". ") } : {}) };
  }

  if (SHORT_VERSION.test(input)) {
    const filled = coerce(input)!.version;
    return { input, ok: true, version: filled, note: `Read as ${filled}` };
  }
  return { input, ok: false, error: "Not a version. Expected major.minor.patch, like 1.4.2 or 2.0.0-beta.1" };
}

/** Versions separated by lines, commas, semicolons or spaces. */
export function parseVersionList(text: string): ParsedVersion[] {
  return text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(parseVersion);
}

export type RangeKind = "caret" | "tilde" | "hyphen" | "wildcard" | "comparison" | "exact" | "any";

export interface RangeAlternative {
  /** This part of the range as typed, between any ||. */
  source: string;
  kind: RangeKind;
  /** What this kind of range allows, in a sentence. */
  meaning: string;
  /** The comparators it stands for, e.g. ">=1.2.3 <2.0.0-0". */
  formal: string;
  /** The same in words: "at least 1.2.3 and below 2.0.0". */
  words: string;
}

export type RangeAnalysis =
  | { ok: true; normalized: string; alternatives: RangeAlternative[]; satisfiable: boolean; warnings: string[] }
  | { ok: false; error: string };

export interface RangeOptions {
  /** Let any prerelease in, not only those of a version the range names. */
  includePrerelease?: boolean;
}

const MAX_RANGE_LENGTH = 1024;
const DIST_TAGS = new Set(["latest", "next", "beta", "alpha", "canary", "rc", "experimental", "nightly"]);

export function analyzeRange(raw: string, { includePrerelease = false }: RangeOptions = {}): RangeAnalysis {
  const input = raw.trim();
  if (input.length > MAX_RANGE_LENGTH) return { ok: false, error: `Ranges longer than ${MAX_RANGE_LENGTH} characters aren't checked.` };
  const options = { loose: true, includePrerelease };
  const normalized = validRange(input, options);
  if (normalized === null) {
    if (DIST_TAGS.has(input.toLowerCase())) return { ok: false, error: `"${input}" is a dist-tag, a name the registry points at a version, not a range.` };
    return { ok: false, error: "Not a valid range. Examples: ^1.2.3, ~1.2, 1.x, >=1.2.0 <2.0.0, 1.0.0 - 2.0.0" };
  }

  const range = new Range(input, options);
  const sources = input.split("||").map((s) => s.trim());
  const warnings: string[] = [];
  if (sources.length > 1 && sources.some((s) => s === "")) {
    warnings.push("An empty part between || matches every version, so the whole range does.");
  }

  // Range drops alternatives that duplicate others, so pair them with the typed parts only when counts agree.
  const alternatives = range.set.map((comparators, i) => {
    const source = range.set.length === sources.length ? sources[i] : comparators.map((c) => c.value).join(" ");
    return describeAlternative(source || "*", comparators);
  });

  return { ok: true, normalized: range.range || "*", alternatives, satisfiable: minVersion(range) !== null, warnings };
}

function describeAlternative(source: string, comparators: readonly Comparator[]): RangeAlternative {
  const formal = comparators.map((c) => c.value).join(" ") || "*";
  const words = comparators.every((c) => c.value === "") ? "any version" : comparators.map(describeComparator).join(" and ");
  const kind = rangeKind(source, comparators);
  return { source, kind, meaning: kindMeaning(kind, comparators), formal, words };
}

/** node-semver writes "below 2.0.0, its prereleases too" as <2.0.0-0; in words that's just "below 2.0.0". */
function shown(version: SemVer): string {
  return version.prerelease.length === 1 && version.prerelease[0] === 0 ? `${version.major}.${version.minor}.${version.patch}` : version.version;
}

function describeComparator(c: Comparator): string {
  const v = shown(c.semver);
  switch (c.operator) {
    case ">=":
      return `at least ${v}`;
    case ">":
      return `above ${v}`;
    case "<":
      return `below ${v}`;
    case "<=":
      return `at most ${v}`;
    default:
      return `exactly ${v}`;
  }
}

function rangeKind(source: string, comparators: readonly Comparator[]): RangeKind {
  if (comparators.every((c) => c.value === "")) return "any";
  if (source.includes("^")) return "caret";
  if (source.includes("~")) return "tilde";
  if (/\s-\s/.test(source)) return "hyphen";
  if (/(^|[.\s=<>])[xX*](?=$|[.\s])/.test(source) || /^[v=]*\d+(\.\d+)?$/.test(source)) return "wildcard";
  if (comparators.length === 1 && comparators[0].operator === "") return "exact";
  return "comparison";
}

function kindMeaning(kind: RangeKind, comparators: readonly Comparator[]): string {
  switch (kind) {
    case "any":
      return "Any version.";
    case "caret":
      return `Caret: updates that keep the left-most non-zero part. ${updatesAllowed(comparators)}`;
    case "tilde":
      return `Tilde: patch updates, or minor ones too if only a major is given. ${updatesAllowed(comparators)}`;
    case "hyphen":
      return "Hyphen range: both ends included. A partial end like 2.3 covers every 2.3.x.";
    case "wildcard":
      return "Wildcard: x, * or a missing part stands for any number there.";
    case "exact":
      return "Exactly this version.";
    case "comparison":
      return "Comparisons, all of which must hold.";
  }
}

/** For ^ and ~: which updates the bounds let through, read off the bounds themselves. */
function updatesAllowed(comparators: readonly Comparator[]): string {
  const low = comparators.find((c) => c.operator === ">=")?.semver;
  const high = comparators.find((c) => c.operator === "<")?.semver;
  if (!low || !high) return "";
  if (high.major > low.major) return "Here that's minor and patch updates, no new major.";
  if (high.minor > low.minor) return "Here that's patch updates only.";
  return "Here that's only this version (and its prereleases).";
}

export interface VersionCheck {
  version: ParsedVersion;
  matches: boolean;
  reason: string;
}

export interface CheckResult {
  /** Newest first, then the ones that aren't versions, in the order given. */
  checks: VersionCheck[];
  matching: number;
  /** The newest matching version, what npm would install from this list. */
  highest: string | null;
}

/** Checks each version against a range that analyzeRange accepted. */
export function checkVersions(rangeText: string, versions: ParsedVersion[], { includePrerelease = false }: RangeOptions = {}): CheckResult {
  const range = new Range(rangeText.trim(), { loose: true, includePrerelease });
  const alternatives = rangeText.split("||").map((s) => s.trim());
  const named = range.set.length === alternatives.length;

  const checks = versions.map((version): VersionCheck => {
    if (!version.ok) return { version, matches: false, reason: version.error };
    const v = new SemVer(version.version);
    // node-semver decides; the reasons below only explain its answer.
    if (range.test(v)) {
      const fits = range.set.findIndex((set) => set.every((c) => c.test(v)) && prereleaseAllowed(v, set, includePrerelease));
      return { version, matches: true, reason: range.set.length > 1 && named && fits >= 0 ? `Fits ${alternatives[fits]}` : "In range" };
    }
    return { version, matches: false, reason: missReason(v, range, alternatives, named, includePrerelease) };
  });

  const valid = checks.filter((c) => c.version.ok).sort((a, b) => rcompare((a.version as { version: string }).version, (b.version as { version: string }).version));
  const invalid = checks.filter((c) => !c.version.ok);
  const matched = valid.filter((c) => c.matches);
  return {
    checks: [...valid, ...invalid],
    matching: matched.length,
    highest: matched.length ? (matched[0].version as { version: string }).version : null,
  };
}

/**
 * npm's prerelease rule, as node-semver applies it: a prerelease only fits if the range names a
 * prerelease of the same major.minor.patch, so ^1.2.3 doesn't pull in 1.3.0-beta by surprise.
 */
function prereleaseAllowed(v: SemVer, set: readonly Comparator[], includePrerelease: boolean): boolean {
  if (includePrerelease || v.prerelease.length === 0) return true;
  return set.some(
    (c) =>
      // The "any version" comparator from * carries no real version.
      c.semver instanceof SemVer &&
      c.semver.prerelease.length > 0 &&
      c.semver.major === v.major &&
      c.semver.minor === v.minor &&
      c.semver.patch === v.patch,
  );
}

function missReason(v: SemVer, range: Range, alternatives: string[], named: boolean, includePrerelease: boolean): string {
  if (range.set.length > 1) {
    if (!named) return "Fits none of the alternatives";
    const list = alternatives.length === 2 ? `neither ${alternatives[0]} nor ${alternatives[1]}` : `none of ${alternatives.slice(0, -1).join(", ")} or ${alternatives[alternatives.length - 1]}`;
    return `Fits ${list}`;
  }
  const set = range.set[0];
  const failing = set.find((c) => !c.test(v));
  if (failing) {
    const v2 = shown(failing.semver);
    switch (failing.operator) {
      case ">=":
        return `Too low: needs at least ${v2}`;
      case ">":
        return `Too low: needs above ${v2}`;
      case "<":
        return `Too high: needs below ${v2}`;
      case "<=":
        return `Too high: needs at most ${v2}`;
      default:
        return `Needs exactly ${v2}`;
    }
  }
  if (!includePrerelease && !prereleaseAllowed(v, set, false)) {
    return "Prerelease: npm ranges only include prereleases of a version they name. Turn on prereleases to count it.";
  }
  return "Out of range";
}

export type Comparison =
  | {
      ok: true;
      a: string;
      b: string;
      /** -1 when a comes before b, 1 after, 0 equal. */
      order: -1 | 0 | 1;
      /** The biggest part that differs: major, minor, patch, prerelease, premajor and so on. */
      change: ReleaseType | null;
      note?: string;
    }
  | { ok: false; side: "a" | "b"; error: string };

export function compareVersions(rawA: string, rawB: string): Comparison {
  const a = parseVersion(rawA);
  if (!a.ok) return { ok: false, side: "a", error: a.error };
  const b = parseVersion(rawB);
  if (!b.ok) return { ok: false, side: "b", error: b.error };
  const order = compare(a.version, b.version) as -1 | 0 | 1;
  const buildA = build(rawA);
  const buildB = build(rawB);
  return {
    ok: true,
    a: a.version + buildA,
    b: b.version + buildB,
    order,
    change: diff(a.version, b.version),
    ...(order === 0 && buildA !== buildB ? { note: "They differ only in build metadata (after +), which doesn't count in comparisons." } : {}),
  };
}

/** "+build.7" from "1.2.3+build.7", or "". */
function build(raw: string): string {
  const plus = raw.trim().indexOf("+");
  return plus < 0 ? "" : raw.trim().slice(plus);
}

const BUMPS: { label: string; type: ReleaseType }[] = [
  { label: "Major", type: "major" },
  { label: "Minor", type: "minor" },
  { label: "Patch", type: "patch" },
  { label: "Prerelease", type: "prerelease" },
];

/** Dot-separated letters, digits and hyphens, like "beta" or "rc.next". */
export const PRERELEASE_TAG = /^[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*$/;

/**
 * The next major, minor, patch and prerelease after `version`, prereleases tagged `preid` (a plain
 * number, as in 1.2.4-0, when it's empty). Null for a tag that isn't valid.
 */
export function bumpVersion(version: string, preid = "beta"): { label: string; version: string }[] | null {
  const tag = preid.trim();
  if (tag !== "" && !PRERELEASE_TAG.test(tag)) return null;
  return BUMPS.map(({ label, type }) => ({ label, version: (tag ? inc(version, type, tag) : inc(version, type))! }));
}

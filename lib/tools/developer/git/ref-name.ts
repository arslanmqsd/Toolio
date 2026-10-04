// Field validators. Each gets a trimmed, non-empty value and returns a message, or null when it's valid.

const isControl = (ch: string) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127;

/** Branch and tag names, following `git check-ref-format`. A leading "-" is refused too, or Git reads an option. */
export function refNameError(name: string): string | null {
  if (/\s/.test(name)) return "Can't contain spaces.";
  if ([...name].some(isControl)) return "Can't contain control characters.";
  if (name.startsWith("-")) return "Can't start with -.";
  const bad = name.match(/[~^:?*[\\]/);
  if (bad) return `Can't contain ${bad[0]}.`;
  if (name.includes("..")) return "Can't contain two dots in a row.";
  if (name.includes("@{")) return "Can't contain @{.";
  if (name === "@") return "Can't be just @.";
  if (name.startsWith("/") || name.endsWith("/")) return "Can't start or end with /.";
  if (name.includes("//")) return "Can't contain //.";
  if (name.split("/").some((part) => part.startsWith("."))) return "No part between slashes can start with a dot.";
  if (name.endsWith(".lock")) return "Can't end with .lock.";
  if (name.endsWith(".")) return "Can't end with a dot.";
  return null;
}

/** Anything Git resolves to a commit: a hash, branch, tag, HEAD~2, origin/main. */
export function revisionError(rev: string): string | null {
  if (/\s/.test(rev)) return "Can't contain spaces.";
  if (rev.startsWith("-")) return "Can't start with -.";
  return null;
}

export function pathError(path: string): string | null {
  return path.startsWith("-") ? "Can't start with -." : null;
}

/** A space-separated list of paths. */
export function pathsError(paths: string): string | null {
  return paths.split(/\s+/).some((path) => path.startsWith("-")) ? "Paths can't start with -." : null;
}

export function integerError(min: number) {
  return (value: string): string | null =>
    /^\d+$/.test(value) && Number(value) >= min ? null : `Enter a whole number, ${min} or more.`;
}

export function urlError(url: string): string | null {
  if (/\s/.test(url)) return "Can't contain spaces.";
  if (url.startsWith("-")) return "Can't start with -.";
  return null;
}

export function singleLineError(text: string): string | null {
  return /[\r\n]/.test(text) ? "Must be a single line." : null;
}

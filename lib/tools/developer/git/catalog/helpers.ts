import { integerError, pathError, pathsError, refNameError, revisionError, singleLineError, urlError } from "../ref-name";
import type { Args, Danger, Field, Part, Step } from "../types";

export const part = (text: string, explain: string): Part => ({ text, explain });

/** `parts` when `condition` holds, else none: for spreading optional parts into a step. */
export const when = (condition: boolean, ...parts: Part[]): Part[] => (condition ? parts : []);

export function step(danger: Danger, parts: Part[], extra: Pick<Step, "warning" | "saferAlternative"> = {}): Step {
  return { parts, danger, ...extra };
}

export const REWRITE_WARNING =
  "Rewrites commits. If they were already pushed, you'll need a force push, and anyone who pulled them has to reset to the new version.";

export const refField = (id: string, label: string, extra: Partial<Field> = {}): Field => ({
  id,
  label,
  kind: "text",
  default: "",
  placeholder: id,
  validate: refNameError,
  ...extra,
});

export const revisionField = (id: string, label: string, extra: Partial<Field> = {}): Field => ({
  id,
  label,
  kind: "text",
  default: "",
  placeholder: "commit",
  help: "A commit hash, branch, tag, or something like HEAD~2.",
  validate: revisionError,
  ...extra,
});

export const remoteField = (extra: Partial<Field> = {}): Field =>
  refField("remote", "Remote", { default: "origin", ...extra });

export const countField = (label: string, min = 1, extra: Partial<Field> = {}): Field => ({
  id: "count",
  label,
  kind: "number",
  default: String(min),
  placeholder: "n",
  validate: integerError(min),
  ...extra,
});

export const stashField = (): Field => ({
  id: "index",
  label: "Stash number",
  kind: "number",
  default: "0",
  placeholder: "n",
  help: "0 is the newest. List your stashes to see the others.",
  validate: integerError(0),
});

export const pathField = (id: string, label: string): Field => ({
  id,
  label,
  kind: "text",
  default: "",
  placeholder: "path",
  validate: pathError,
});

export const pathsField = (extra: Partial<Field> = {}): Field => ({
  id: "paths",
  label: "Files",
  kind: "text",
  default: "",
  optional: true,
  placeholder: "paths",
  help: "Separate paths with spaces. Leave empty for all files.",
  validate: pathsError,
  ...extra,
});

export const messageField = (id = "subject", label = "Commit message", extra: Partial<Field> = {}): Field => ({
  id,
  label,
  kind: "prose",
  default: "",
  placeholder: "message",
  validate: singleLineError,
  ...extra,
});

export const urlField = (): Field => ({
  id: "url",
  label: "URL",
  kind: "text",
  default: "",
  placeholder: "url",
  help: "HTTPS or SSH, like git@github.com:you/repo.git.",
  validate: urlError,
});

export const subjectPart = (a: Args): Part => part(`-m ${a.q("subject")}`, "The commit message.");

/** A second -m, when the optional "body" field is filled. */
export const bodyParts = (a: Args): Part[] =>
  when(a.has("body"), part(`-m ${a.q("body")}`, "A second -m adds a paragraph: the commit's body."));

/** The "paths" field's files, or "." for all of them. */
export const pathsPart = (a: Args, explain: string): Part =>
  a.has("paths") ? part(a.list("paths").join(" "), explain) : part(".", "Every file in the current folder and below.");

/** HEAD~n for the "count" field. */
export const backPart = (a: Args): Part =>
  part(`HEAD~${a.q("count")}`, "The commit that many steps before the current one.");

/** stash@{n} for the "index" field. */
export const stashRef = (a: Args): Part => part(`stash@{${a.q("index")}}`, "Which stash: 0 is the newest.");

export type Danger = "safe" | "caution" | "destructive";

export type GitCategoryId =
  | "branches"
  | "commits"
  | "remote"
  | "undo"
  | "stash"
  | "merge-rebase"
  | "tags"
  | "inspect"
  | "cleanup";

/** Text, number and select fields hold strings; checkboxes hold booleans. */
export type FieldValue = string | boolean;
export type FieldValues = Record<string, FieldValue>;

export interface Field {
  id: string;
  label: string;
  help?: string;
  /** "text" is code-like (branch names, hashes), "prose" is a sentence (commit messages). */
  kind: "text" | "prose" | "number" | "select" | "checkbox";
  default: FieldValue;
  /** Shown in the empty input, and as <placeholder> in the command while the field is empty. Defaults to the id. */
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Text fields only. Required otherwise. */
  optional?: boolean;
  /** Gets the trimmed, non-empty value. */
  validate?: (value: string) => string | null;
  /** Hidden fields are neither validated nor required. */
  shownWhen?: (values: FieldValues) => boolean;
}

/** What a task's `build` reads its field values through. */
export interface Args {
  /** The value shell-quoted, or "<placeholder>" while a required field is empty. */
  q(id: string): string;
  /** The trimmed value unquoted, or "<placeholder>". For building a larger string that is quoted as a whole. */
  text(id: string): string;
  /** Whether the field has a value (a placeholder counts). */
  has(id: string): boolean;
  flag(id: string): boolean;
  /** A select's value. Options are fixed, so it's safe to insert unquoted. */
  choice(id: string): string;
  /** A space-separated list, each item quoted. */
  list(id: string): string[];
}

export interface Part {
  /** Already shell-quoted. */
  text: string;
  explain: string;
}

export interface Step {
  /** Joined with spaces to form the command. */
  parts: Part[];
  danger: Danger;
  /** Required for destructive steps. */
  warning?: string;
  saferAlternative?: { taskId: string; label: string };
}

export interface Task {
  /** Stable kebab-case id, used in the URL. */
  id: string;
  category: GitCategoryId;
  title: string;
  summary: string;
  /** Extra phrasings for search. */
  synonyms: string[];
  fields: Field[];
  build: (args: Args) => Step[];
  related?: string[];
}

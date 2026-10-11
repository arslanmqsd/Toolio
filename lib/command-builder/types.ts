/**
 * The task model shared by the command builders (Git, Docker): a task is a form whose fields build
 * one or more explained command steps, with how risky each step is.
 */

export type Danger = "safe" | "caution" | "destructive";

/** Bash and zsh share POSIX quoting; PowerShell differs. */
export type Shell = "posix" | "powershell";

/** Text, number, lines and select fields hold strings; checkboxes hold booleans. */
export type FieldValue = string | boolean;
export type FieldValues = Record<string, FieldValue>;

export interface Field {
  id: string;
  label: string;
  help?: string;
  /**
   * "text" is code-like (branch names, image tags), "prose" is a sentence (commit messages), "lines"
   * is one entry per line (ports, environment variables).
   */
  kind: "text" | "prose" | "number" | "lines" | "select" | "checkbox";
  default: FieldValue;
  /** Shown in the empty input, and as <placeholder> in the command while the field is empty. Defaults to the id. */
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Text fields only. Required otherwise. */
  optional?: boolean;
  /** Gets the trimmed, non-empty value. For "lines", each non-empty line in turn. */
  validate?: (value: string) => string | null;
  /** Hidden fields are neither validated nor required. */
  shownWhen?: (values: FieldValues) => boolean;
  /** May hold credentials or secret values: never saved to history. */
  sensitive?: boolean;
}

/** What a task's `build` reads its field values through. */
export interface Args {
  /** The shell the command is for. */
  shell: Shell;
  /** The value shell-quoted, or "<placeholder>" while a required field is empty. */
  q(id: string): string;
  /** The trimmed value unquoted, or "<placeholder>". For building a larger string that is quoted as a whole. */
  text(id: string): string;
  /** Any string quoted for the shell, for values a task puts together itself. */
  quote(value: string): string;
  /** Whether the field has a value (a placeholder counts). */
  has(id: string): boolean;
  flag(id: string): boolean;
  /** A select's value. Options are fixed, so it's safe to insert unquoted. */
  choice(id: string): string;
  /** A space-separated list, each item quoted. */
  list(id: string): string[];
  /** A "lines" field's non-empty lines, trimmed and unquoted. */
  lines(id: string): string[];
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
  /**
   * What the user must agree to before the command is shown, for steps that delete data with no way back.
   * Implies destructive.
   */
  confirm?: string;
  /** Things to know that aren't about danger, like a secret ending up in shell history. */
  notes?: string[];
}

export interface Preset {
  id: string;
  label: string;
  /** Applied over the task's defaults. */
  values: FieldValues;
}

export interface Task<Category extends string = string> {
  /** Stable kebab-case id, used in the URL. */
  id: string;
  category: Category;
  title: string;
  summary: string;
  /** Extra phrasings for search. */
  synonyms: string[];
  fields: Field[];
  build: (args: Args) => Step[];
  related?: string[];
  /** Ready-made values, like the image, ports and volumes for PostgreSQL. */
  presets?: Preset[];
}

/** What the shared picker, form and output need to know about one builder's tasks. */
export interface Catalog<Category extends string = string> {
  /** "Git", "Docker": used in labels like "Search Docker tasks". */
  name: string;
  /** Prefix for element ids, unique per builder. */
  idPrefix: string;
  categories: { id: Category; label: string }[];
  tasks: Task<Category>[];
  getTask(id: string): Task<Category> | undefined;
  search(query: string): { item: Task<Category> }[];
  /** Offered before a task is picked. */
  quickStart: string[];
  searchPlaceholder: string;
}

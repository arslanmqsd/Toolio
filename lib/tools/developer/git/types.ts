import type { Catalog as BaseCatalog, Task as BaseTask } from "@/lib/command-builder/types";

export type { Args, Danger, Field, FieldValue, FieldValues, Part, Step } from "@/lib/command-builder/types";

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

export type Task = BaseTask<GitCategoryId>;
export type Catalog = BaseCatalog<GitCategoryId>;

import type { Catalog } from "./types";
import { GIT_CATEGORIES, getTask, QUICK_START, TASKS } from "./catalog";
import { searchTasks } from "./search";

export const gitCatalog: Catalog = {
  name: "Git",
  idPrefix: "git",
  categories: GIT_CATEGORIES,
  tasks: TASKS,
  getTask,
  search: searchTasks,
  quickStart: QUICK_START,
  searchPlaceholder: "undo last commit, delete branch…",
};

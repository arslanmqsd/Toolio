import type { Catalog } from "./types";
import { DOCKER_CATEGORIES, getTask, QUICK_START, TASKS } from "./catalog";
import { searchTasks } from "./search";

export const dockerCatalog: Catalog = {
  name: "Docker",
  idPrefix: "docker",
  categories: DOCKER_CATEGORIES,
  tasks: TASKS,
  getTask,
  search: searchTasks,
  quickStart: QUICK_START,
  searchPlaceholder: "run postgres, shell into container, free disk space…",
};

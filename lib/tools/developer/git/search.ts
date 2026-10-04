import { createFuzzySearch } from "@/lib/search/fuzzy";
import { TASKS } from "./catalog";

/** Ranked task matches for "I want to…" queries. */
export const searchTasks = createFuzzySearch(TASKS, [
  { name: "title", weight: 3 },
  { name: "synonyms", weight: 2 },
  { name: "summary", weight: 1 },
]);

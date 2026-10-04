import type { GitCategoryId, Task } from "../types";
import { branchTasks } from "./branches";
import { commitTasks } from "./commits";
import { remoteTasks } from "./remote";
import { undoTasks } from "./undo";

/** Display order for chips and list groups. TASKS follows the same order. */
export const GIT_CATEGORIES: { id: GitCategoryId; label: string }[] = [
  { id: "branches", label: "Branches" },
  { id: "commits", label: "Commits" },
  { id: "remote", label: "Remote" },
  { id: "undo", label: "Undo" },
  { id: "stash", label: "Stash" },
  { id: "merge-rebase", label: "Merge & Rebase" },
  { id: "tags", label: "Tags" },
  { id: "inspect", label: "Inspect" },
  { id: "cleanup", label: "Cleanup" },
];

export const TASKS: Task[] = [...branchTasks, ...commitTasks, ...remoteTasks, ...undoTasks];

const tasksById = new Map(TASKS.map((task) => [task.id, task]));

export function getTask(id: string): Task | undefined {
  return tasksById.get(id);
}

/** Offered before a task is picked. */
export const QUICK_START = ["reset-soft", "create-branch", "stash-changes", "discard-file-changes"];

import type { DockerCategoryId, Task } from "../types";
import { containerTasks } from "./containers";
import { imageTasks } from "./images";
import { networkTasks } from "./networks";
import { registryTasks } from "./registry";
import { systemTasks } from "./system";
import { volumeTasks } from "./volumes";

/** Display order for chips and list groups. TASKS follows the same order. */
export const DOCKER_CATEGORIES: { id: DockerCategoryId; label: string }[] = [
  { id: "containers", label: "Containers" },
  { id: "images", label: "Images" },
  { id: "networks", label: "Networks" },
  { id: "volumes", label: "Volumes" },
  { id: "registry", label: "Registry" },
  { id: "system", label: "System" },
];

export const TASKS: Task[] = [...containerTasks, ...imageTasks, ...networkTasks, ...volumeTasks, ...registryTasks, ...systemTasks];

const tasksById = new Map(TASKS.map((task) => [task.id, task]));

export function getTask(id: string): Task | undefined {
  return tasksById.get(id);
}

/** Offered before a task is picked. */
export const QUICK_START = ["run", "exec", "logs", "build", "prune"];

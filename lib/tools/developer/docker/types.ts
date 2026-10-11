import type { Catalog as BaseCatalog, Task as BaseTask } from "@/lib/command-builder/types";

export type { Args, Danger, Field, FieldValues, Part, Preset, Step } from "@/lib/command-builder/types";

export type DockerCategoryId = "containers" | "images" | "networks" | "volumes" | "registry" | "system";

export type Task = BaseTask<DockerCategoryId>;
export type Catalog = BaseCatalog<DockerCategoryId>;

import type { Task } from "../types";
import { durationError } from "../validate";
import { checkbox, optionalText, part, step, when } from "./helpers";

export const systemTasks: Task[] = [
  {
    id: "system-df",
    category: "system",
    title: "Show disk usage",
    summary: "How much space images, containers, volumes and build cache take, and how much is reclaimable.",
    synonyms: ["docker system df", "docker disk usage", "how much space", "docker using too much space"],
    fields: [checkbox("verbose", "Per item (-v)")],
    build: (a) => [step("safe", [part("docker system df", "Summarises Docker's disk use."), ...when(a.flag("verbose"), part("-v", "Lists each image, container and volume."))])],
    related: ["prune"],
  },
  {
    id: "prune",
    category: "system",
    title: "Clean up unused data",
    summary: "Deletes stopped containers, unused networks, dangling images and build cache, optionally more.",
    synonyms: ["docker system prune", "free disk space", "clean docker", "remove everything unused", "prune volumes", "prune -a"],
    fields: [
      checkbox("all", "All unused images, not just untagged ones (-a)"),
      checkbox("volumes", "Unused volumes too (--volumes)"),
      optionalText("until", "Only older than", { placeholder: "24h", help: "Keeps anything created more recently. Doesn't apply to volumes.", validate: durationError }),
      checkbox("force", "Don't ask for confirmation (-f)"),
    ],
    build: (a) => {
      const wide = a.flag("all") || a.flag("volumes");
      return [
        step(
          "destructive",
          [
            part("docker system prune", "Deletes stopped containers, unused networks, untagged images and the build cache."),
            ...when(a.flag("all"), part("-a", "Also every image no container uses, tagged or not.")),
            ...when(a.flag("volumes"), part("--volumes", "Also every volume no container uses.")),
            ...when(a.has("until"), part(`--filter ${a.quote(`until=${a.text("until")}`)}`, "Only things created before then.")),
            ...when(a.flag("force"), part("-f", "Skips Docker's own “Are you sure?” prompt.")),
          ],
          {
            warning: [
              "Stopped containers are deleted with anything written inside them.",
              a.flag("all") ? "Every image not used by a container is deleted; ones you built and never pushed must be rebuilt." : "",
              a.flag("volumes") ? "Every volume not attached to a container is deleted with its data, including databases whose container is just stopped or removed." : "",
            ]
              .filter(Boolean)
              .join(" "),
            confirm: wide ? "I understand this deletes data for good, and checked docker system df first." : undefined,
            saferAlternative: { taskId: "system-df", label: "See what would be freed" },
          },
        ),
      ];
    },
    related: ["system-df", "images"],
  },
];

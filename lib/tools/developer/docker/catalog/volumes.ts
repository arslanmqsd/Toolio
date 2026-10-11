import type { Task } from "../types";
import { nameError, namesError } from "../validate";
import { checkbox, optionalText, part, step, when } from "./helpers";

const volumesField = { id: "volumes", label: "Volumes", kind: "text" as const, default: "", placeholder: "volumes", help: "Names, separated by spaces. docker volume ls lists them.", validate: namesError };

export const volumeTasks: Task[] = [
  {
    id: "volume-create",
    category: "volumes",
    title: "Create a volume",
    summary: "Makes a named volume: storage Docker keeps when containers are removed.",
    synonyms: ["docker volume create", "new volume", "persistent storage"],
    fields: [
      { id: "volume", label: "Name", kind: "text", default: "", placeholder: "volume", validate: nameError },
      optionalText("driver", "Driver", { placeholder: "local", help: "Leave empty for local, stored on this machine.", validate: nameError }),
    ],
    build: (a) => [
      step(
        "safe",
        [
          part("docker volume create", "Creates a named volume."),
          ...when(a.has("driver"), part(`--driver ${a.q("driver")}`, "Where and how it's stored.")),
          part(a.q("volume"), "The volume's name."),
        ],
        { notes: ["docker run -v name:/path creates the volume by itself if it doesn't exist; this is for setting it up first."] },
      ),
    ],
    related: ["run", "volume-inspect"],
  },
  {
    id: "volume-inspect",
    category: "volumes",
    title: "Inspect a volume",
    summary: "Shows a volume's details, including where its data is on the host.",
    synonyms: ["docker volume inspect", "volume details", "where is volume data", "docker volume ls"],
    fields: [volumesField],
    build: (a) => [step("safe", [part("docker volume inspect", "Prints a volume's details as JSON."), part(a.list("volumes").join(" "), "The volumes.")])],
    related: ["volume-rm"],
  },
  {
    id: "volume-rm",
    category: "volumes",
    title: "Remove a volume",
    summary: "Deletes named volumes and all the data in them.",
    synonyms: ["docker volume rm", "delete volume", "remove volume", "delete database data"],
    fields: [volumesField, checkbox("force", "Force (-f)")],
    build: (a) => [
      step(
        "destructive",
        [
          part("docker volume rm", "Deletes volumes."),
          ...when(a.flag("force"), part("-f", "Doesn't stop to report errors, like a volume that doesn't exist.")),
          part(a.list("volumes").join(" "), "The volumes to delete."),
        ],
        {
          warning: "Everything in the volumes is deleted for good: database files, uploads, whatever was stored there. Docker has no undo or trash. Back them up first if you might need the data.",
          confirm: "I understand the data in these volumes is deleted for good.",
          saferAlternative: { taskId: "volume-inspect", label: "Inspect them first" },
        },
      ),
    ],
    related: ["volume-inspect"],
  },
];

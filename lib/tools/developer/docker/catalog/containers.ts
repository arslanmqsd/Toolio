import type { Task } from "../types";
import { nameError, sinceError, integerError } from "../validate";
import {
  CONTAINER_PRESETS,
  checkbox,
  commandError,
  commandWords,
  containerConfigFields,
  containerConfigParts,
  containerField,
  containersField,
  optionalText,
  part,
  step,
  when,
} from "./helpers";

const timeoutField = optionalText("time", "Seconds to wait before killing", {
  kind: "number",
  placeholder: "10",
  help: "Docker asks the process to stop, then kills it after this long. Default 10.",
  validate: integerError(0),
});

export const containerTasks: Task[] = [
  {
    id: "run",
    category: "containers",
    title: "Run a container",
    summary: "Starts a new container from an image, with ports, environment, volumes and limits.",
    synonyms: ["docker run", "start container from image", "launch container", "run image", "run nginx", "run postgres", "run redis"],
    fields: [
      ...containerConfigFields(),
      checkbox("detach", "Run in the background (-d)", true),
      checkbox("rm", "Remove the container when it stops (--rm)"),
    ],
    presets: CONTAINER_PRESETS,
    build: (a) => {
      const { parts, notes, warnings } = containerConfigParts(a);
      return [
        step(
          warnings.length ? "caution" : "safe",
          [
            part("docker run", "Creates and starts a new container."),
            ...when(a.flag("detach"), part("-d", "Runs it in the background and prints its id.")),
            ...when(a.flag("rm"), part("--rm", "Deletes the container, but not named volumes, once it stops.")),
            ...parts,
          ],
          { notes, warning: warnings.join(" ") || undefined },
        ),
      ];
    },
    related: ["create", "logs", "exec", "ps"],
  },
  {
    id: "create",
    category: "containers",
    title: "Create a container without starting it",
    summary: "Sets up a container from an image, ready for docker start.",
    synonyms: ["docker create", "prepare container"],
    fields: containerConfigFields(),
    presets: CONTAINER_PRESETS,
    build: (a) => {
      const { parts, notes, warnings } = containerConfigParts(a);
      return [step(warnings.length ? "caution" : "safe", [part("docker create", "Creates a container but doesn't start it."), ...parts], { notes, warning: warnings.join(" ") || undefined })];
    },
    related: ["start", "run"],
  },
  {
    id: "start",
    category: "containers",
    title: "Start a container",
    summary: "Starts stopped or newly created containers.",
    synonyms: ["docker start", "resume container", "boot container"],
    fields: [containersField(), checkbox("attach", "Show its output and wait (-a)")],
    build: (a) => [
      step("safe", [
        part("docker start", "Starts stopped containers."),
        ...when(a.flag("attach"), part("-a", "Attaches to its output and waits until it stops.")),
        part(a.list("containers").join(" "), "The containers to start."),
      ]),
    ],
    related: ["stop", "ps"],
  },
  {
    id: "stop",
    category: "containers",
    title: "Stop a container",
    summary: "Stops running containers gracefully: the process gets time to shut down.",
    synonyms: ["docker stop", "shut down container", "halt container"],
    fields: [containersField(), timeoutField],
    build: (a) => [
      step(
        "safe",
        [
          part("docker stop", "Sends the stop signal, then kills the process if it hasn't exited in time."),
          ...when(a.has("time"), part(`--time ${a.q("time")}`, "Seconds to wait before killing it.")),
          part(a.list("containers").join(" "), "The containers to stop."),
        ],
        { notes: ["A container started with --rm is deleted when it stops."] },
      ),
    ],
    related: ["start", "restart", "rm"],
  },
  {
    id: "restart",
    category: "containers",
    title: "Restart a container",
    summary: "Stops and starts containers again, e.g. to pick up a changed config file.",
    synonyms: ["docker restart", "reboot container"],
    fields: [containersField(), timeoutField],
    build: (a) => [
      step("safe", [
        part("docker restart", "Stops the containers, then starts them again."),
        ...when(a.has("time"), part(`--time ${a.q("time")}`, "Seconds to wait for each to stop before killing it.")),
        part(a.list("containers").join(" "), "The containers to restart."),
      ]),
    ],
    related: ["logs"],
  },
  {
    id: "rm",
    category: "containers",
    title: "Remove a container",
    summary: "Deletes stopped containers, and with them anything they wrote outside a volume.",
    synonyms: ["docker rm", "delete container", "remove stopped container", "rm -f"],
    fields: [
      containersField(),
      checkbox("force", "Also remove running containers (-f)"),
      checkbox("volumes", "Also delete their anonymous volumes (-v)"),
    ],
    build: (a) => {
      const risky = a.flag("force") || a.flag("volumes");
      return [
        step(
          risky ? "destructive" : "caution",
          [
            part("docker rm", "Deletes containers."),
            ...when(a.flag("force"), part("-f", "Kills running containers first, without letting them shut down cleanly.")),
            ...when(a.flag("volumes"), part("-v", "Deletes the anonymous volumes they created. Named volumes stay.")),
            part(a.list("containers").join(" "), "The containers to delete."),
          ],
          {
            warning: risky
              ? `${a.flag("force") ? "Running containers are killed mid-work. " : ""}${a.flag("volumes") ? "Data in their anonymous volumes is deleted for good. " : ""}Anything written inside the containers is gone too.`
              : "Anything the containers wrote outside a volume, like logs or uploaded files, is deleted with them.",
            confirm: risky ? "I understand this deletes the containers and their data, and can't be undone." : undefined,
            saferAlternative: { taskId: "stop", label: "Just stop them instead" },
          },
        ),
      ];
    },
    related: ["ps", "stop"],
  },
  {
    id: "exec",
    category: "containers",
    title: "Run a command in a container",
    summary: "Runs a command, or opens a shell, inside a running container.",
    synonyms: ["docker exec", "shell into container", "ssh into container", "bash in container", "exec -it", "open terminal in container"],
    fields: [
      containerField(),
      { id: "command", label: "Command", kind: "text", default: "sh", placeholder: "command", help: "sh opens a shell; bash if the image has it. Type it as in bash.", validate: commandError },
      checkbox("interactive", "Interactive terminal (-it)", true),
      optionalText("user", "As user", { placeholder: "root" }),
      optionalText("workdir", "In folder", { placeholder: "/app" }),
    ],
    build: (a) => [
      step("safe", [
        part("docker exec", "Runs a command in a running container."),
        ...when(a.flag("interactive"), part("-it", "Keeps input open and gives it a terminal, so you can type.")),
        ...when(a.has("user"), part(`--user ${a.q("user")}`, "Runs it as this user.")),
        ...when(a.has("workdir"), part(`--workdir ${a.q("workdir")}`, "Starts in this folder.")),
        part(a.q("container"), "The container."),
        part(commandWords(a, "command"), "The command to run."),
      ]),
    ],
    related: ["logs", "ps"],
  },
  {
    id: "logs",
    category: "containers",
    title: "Show a container's logs",
    summary: "Prints what a container wrote to its output, optionally following new lines.",
    synonyms: ["docker logs", "view logs", "tail logs", "follow logs", "container output"],
    fields: [
      containerField(),
      checkbox("follow", "Keep following new lines (-f)", true),
      optionalText("tail", "Only the last lines", { kind: "number", placeholder: "100", validate: integerError(0) }),
      optionalText("since", "Since", { placeholder: "10m", help: "A time back from now, like 10m or 2h, or a date.", validate: sinceError }),
      checkbox("timestamps", "Show timestamps (-t)"),
    ],
    build: (a) => [
      step("safe", [
        part("docker logs", "Prints the container's output."),
        ...when(a.flag("follow"), part("-f", "Keeps printing new lines until you press Ctrl+C.")),
        ...when(a.has("tail"), part(`--tail ${a.q("tail")}`, "Starts with only this many lines from the end.")),
        ...when(a.has("since"), part(`--since ${a.q("since")}`, "Only lines written since then.")),
        ...when(a.flag("timestamps"), part("-t", "Prefixes each line with when it was written.")),
        part(a.q("container"), "The container."),
      ]),
    ],
    related: ["ps", "exec"],
  },
  {
    id: "inspect",
    category: "containers",
    title: "Inspect a container or image",
    summary: "Prints the full configuration and state as JSON, or one field of it.",
    synonyms: ["docker inspect", "container details", "container ip address", "show config"],
    fields: [
      { id: "targets", label: "Containers or images", kind: "text", default: "", placeholder: "name", help: "Names or ids, separated by spaces." },
      optionalText("format", "Just this field", {
        placeholder: "{{.State.Status}}",
        help: "A Go template, like {{.State.Status}} or {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}.",
      }),
    ],
    build: (a) => [
      step("safe", [
        part("docker inspect", "Prints low-level details as JSON."),
        ...when(a.has("format"), part(`--format ${a.q("format")}`, "Prints only what this template picks out.")),
        part(a.list("targets").join(" "), "What to inspect."),
      ]),
    ],
  },
  {
    id: "ps",
    category: "containers",
    title: "List containers",
    summary: "Shows running containers, or all of them, with their status and ports.",
    synonyms: ["docker ps", "list running containers", "show containers", "ps -a"],
    fields: [
      checkbox("all", "Include stopped containers (-a)", true),
      checkbox("quiet", "Only ids (-q), for passing to other commands"),
      optionalText("filter", "Filter", { placeholder: "name=web", help: "Like name=web, status=exited or ancestor=nginx." }),
    ],
    build: (a) => [
      step("safe", [
        part("docker ps", "Lists containers."),
        ...when(a.flag("all"), part("-a", "Stopped ones too.")),
        ...when(a.flag("quiet"), part("-q", "Only their ids.")),
        ...when(a.has("filter"), part(`--filter ${a.q("filter")}`, "Only those that match.")),
      ]),
    ],
    related: ["stats", "logs"],
  },
  {
    id: "stats",
    category: "containers",
    title: "Show live resource usage",
    summary: "CPU, memory, network and disk use per container, updating live.",
    synonyms: ["docker stats", "container cpu usage", "container memory usage", "monitor containers"],
    fields: [
      optionalText("containers", "Containers", { placeholder: "web db", help: "Leave empty for every running container.", validate: (v) => (v.split(/\s+/).every((n) => !nameError(n)) ? null : "Use names or ids separated by spaces.") }),
      checkbox("noStream", "Print once instead of updating (--no-stream)"),
      checkbox("all", "Include stopped containers (-a)"),
    ],
    build: (a) => [
      step("safe", [
        part("docker stats", "Shows resource use per container."),
        ...when(a.flag("noStream"), part("--no-stream", "Prints one snapshot and exits.")),
        ...when(a.flag("all"), part("-a", "Includes stopped containers.")),
        ...when(a.has("containers"), part(a.list("containers").join(" "), "Only these containers.")),
      ]),
    ],
    related: ["ps", "system-df"],
  },
];

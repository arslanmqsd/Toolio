import { splitWords } from "@/lib/shell-quote";
import type { Args, Danger, Field, FieldValues, Part, Step } from "../types";
import {
  cpusError,
  envLineError,
  imageError,
  memoryError,
  nameError,
  namesError,
  portError,
  secretEnvKeys,
  singleLineError,
  userError,
  volumeError,
  durationError,
} from "../validate";

export const part = (text: string, explain: string): Part => ({ text, explain });

// An option like -c or --verbose=1 means the same quoted or not; leaving it bare keeps commands readable.
const OPTION = /^--?[A-Za-z0-9][A-Za-z0-9_.=:/-]*$/;

/** A command field's words, typed as in bash, each quoted again for the chosen shell. */
export function commandWords(a: Args, id: string): string {
  const text = a.text(id);
  if (/^<.*>$/.test(text)) return text;
  const split = splitWords(text);
  const words = split.ok ? split.words : [text];
  return words.map((w) => (OPTION.test(w) ? w : a.quote(w))).join(" ");
}

export function commandError(value: string): string | null {
  const split = splitWords(value);
  return split.ok ? null : split.error;
}

/** `parts` when `condition` holds, else none: for spreading optional parts into a step. */
export const when = (condition: boolean, ...parts: Part[]): Part[] => (condition ? parts : []);

export function step(danger: Danger, parts: Part[], extra: Pick<Step, "warning" | "saferAlternative" | "confirm" | "notes"> = {}): Step {
  return { parts, danger, ...extra };
}

export const imageField = (extra: Partial<Field> = {}): Field => ({
  id: "image",
  label: "Image",
  kind: "text",
  default: "",
  placeholder: "image",
  help: "Pin a version, like nginx:1.27-alpine; latest changes under you.",
  validate: imageError,
  ...extra,
});

export const containerField = (extra: Partial<Field> = {}): Field => ({
  id: "container",
  label: "Container",
  kind: "text",
  default: "",
  placeholder: "container",
  help: "Its name or id. docker ps lists them.",
  validate: nameError,
  ...extra,
});

export const containersField = (extra: Partial<Field> = {}): Field => ({
  id: "containers",
  label: "Containers",
  kind: "text",
  default: "",
  placeholder: "containers",
  help: "Names or ids, separated by spaces.",
  validate: namesError,
  ...extra,
});

export const optionalText = (id: string, label: string, extra: Partial<Field> = {}): Field => ({
  id,
  label,
  kind: "text",
  default: "",
  optional: true,
  validate: singleLineError,
  ...extra,
});

export const checkbox = (id: string, label: string, def = false, extra: Partial<Field> = {}): Field => ({ id, label, kind: "checkbox", default: def, ...extra });

const RESTART_OPTIONS = [
  { value: "", label: "Not set (never restart)" },
  { value: "unless-stopped", label: "unless-stopped: restart unless you stop it" },
  { value: "always", label: "always" },
  { value: "on-failure", label: "on-failure: only after a crash" },
];

/** The options `docker run` and `docker create` share. */
export const containerConfigFields = (): Field[] => [
  imageField(),
  optionalText("name", "Container name", { placeholder: "my-app", help: "Without one, Docker makes up a name.", validate: nameError }),
  {
    id: "ports",
    label: "Ports",
    kind: "lines",
    default: "",
    optional: true,
    placeholder: "8080:80",
    help: "One per line, HOST:CONTAINER. Add 127.0.0.1: in front to reach it from this machine only.",
    validate: portError,
  },
  {
    id: "env",
    label: "Environment variables",
    kind: "lines",
    default: "",
    optional: true,
    sensitive: true,
    placeholder: "NODE_ENV=production",
    help: "One per line, KEY=value. A bare KEY passes the variable on from your shell, which keeps secrets out of the command.",
    validate: envLineError,
  },
  optionalText("envFile", "Env file", { placeholder: ".env", help: "Reads KEY=value lines from a file: the safer place for secrets." }),
  {
    id: "volumes",
    label: "Volumes and bind mounts",
    kind: "lines",
    default: "",
    optional: true,
    placeholder: "pgdata:/var/lib/postgresql/data",
    help: "One per line. name:/path is a named volume Docker keeps; ./folder:/path:ro mounts a folder from here.",
    validate: volumeError,
  },
  optionalText("network", "Network", { placeholder: "my-network", validate: nameError }),
  { id: "restart", label: "Restart policy", kind: "select", default: "", options: RESTART_OPTIONS },
  optionalText("memory", "Memory limit", { placeholder: "512m", validate: memoryError }),
  optionalText("cpus", "CPU limit", { placeholder: "1.5", validate: cpusError }),
  optionalText("user", "Run as user", { placeholder: "1000:1000", help: "A user or uid, with an optional group. Avoids running as root.", validate: userError }),
  optionalText("workdir", "Working directory", { placeholder: "/app", validate: singleLineError }),
  optionalText("healthCmd", "Health check command", { placeholder: "curl -f http://localhost/ || exit 1", help: "Runs in the container's shell; exit code 0 means healthy." }),
  optionalText("healthInterval", "Health check interval", { placeholder: "30s", validate: durationError, shownWhen: (v) => typeof v.healthCmd === "string" && v.healthCmd.trim() !== "" }),
  checkbox("interactive", "Interactive terminal (-it), for a shell or a REPL"),
  optionalText("command", "Command", {
    placeholder: "npm start",
    help: "Replaces the image's default command. Type it as in bash; for pipes or &&, use sh -c '…'.",
    validate: commandError,
  }),
];

/** Parts for the options in containerConfigFields, then the image and command. */
export function containerConfigParts(a: Args): { parts: Part[]; notes: string[]; warnings: string[] } {
  const notes: string[] = [];
  const warnings: string[] = [];
  const parts: Part[] = [];
  if (a.has("name")) parts.push(part(`--name ${a.q("name")}`, "Names the container, so other commands can use the name instead of an id."));
  if (a.flag("interactive")) parts.push(part("-it", "Keeps input open (-i) and gives it a terminal (-t), for a shell or REPL."));
  for (const p of a.lines("ports")) {
    const local = p.startsWith("127.0.0.1:") || p.startsWith("[::1]:");
    parts.push(part(`-p ${a.quote(p)}`, local ? `Publishes ${p} on this machine only.` : `Publishes the port: host first, then the container's.`));
  }
  const env = a.lines("env");
  for (const line of env) {
    parts.push(part(`-e ${a.quote(line)}`, line.includes("=") ? `Sets ${line.split("=")[0]} inside the container.` : `Passes ${line} on from your shell's environment.`));
  }
  if (env.some((line) => !line.includes("="))) notes.push(PASS_THROUGH_NOTE);
  const secrets = secretEnvKeys(env);
  if (secrets.length) {
    notes.push(
      `${secrets.join(", ")} ${secrets.length === 1 ? "looks" : "look"} like ${secrets.length === 1 ? "a secret" : "secrets"}. Values typed into a command end up in your shell history and in docker inspect; put them in an env file, or set them in your shell and pass just the name.`,
    );
  }
  if (a.has("envFile")) parts.push(part(`--env-file ${a.q("envFile")}`, "Reads KEY=value lines from this file."));
  for (const v of a.lines("volumes")) {
    const named = !/^[./~]/.test(v) && v.includes(":");
    parts.push(part(`-v ${a.quote(v)}`, named ? "Mounts a named volume; Docker creates it if it doesn't exist, and keeps its data after the container is gone." : "Mounts a folder or file from this machine."));
    if (v.startsWith("/var/run/docker.sock")) warnings.push("Mounting the Docker socket gives the container full control of Docker on this machine, which is as good as root. Only do it for tools you trust.");
  }
  if (a.has("network")) parts.push(part(`--network ${a.q("network")}`, "Joins this network, where containers reach each other by name."));
  const restart = a.choice("restart");
  if (restart) parts.push(part(`--restart ${restart}`, restart === "on-failure" ? "Restarts it when it exits with an error." : restart === "always" ? "Restarts it whenever it stops, and when Docker starts." : "Restarts it unless you stopped it yourself."));
  if (a.has("memory")) parts.push(part(`--memory ${a.q("memory")}`, "Most memory it can use; it's stopped if it goes over."));
  if (a.has("cpus")) parts.push(part(`--cpus ${a.q("cpus")}`, "How many CPUs' worth of time it can use."));
  if (a.has("user")) parts.push(part(`--user ${a.q("user")}`, "Runs the process as this user instead of the image's default, often root."));
  if (a.has("workdir")) parts.push(part(`--workdir ${a.q("workdir")}`, "The folder the command starts in."));
  if (a.has("healthCmd")) {
    parts.push(part(`--health-cmd ${a.q("healthCmd")}`, "Docker runs this to check the container is working."));
    if (a.has("healthInterval")) parts.push(part(`--health-interval ${a.q("healthInterval")}`, "How often to run the health check."));
  }
  parts.push(part(a.q("image"), "The image to start from. Docker pulls it if it isn't here yet."));
  if (a.has("command")) parts.push(part(commandWords(a, "command"), "The command to run instead of the image's default."));
  return { parts, notes, warnings };
}

/** Values for a run/create preset: fields not given stay at their defaults. */
export const containerPreset = (id: string, label: string, values: FieldValues) => ({ id, label, values });

export const CONTAINER_PRESETS = [
  containerPreset("nginx", "Nginx", { image: "nginx:1.27-alpine", name: "web", ports: "8080:80", volumes: "./site:/usr/share/nginx/html:ro", restart: "unless-stopped" }),
  containerPreset("node", "Node.js", {
    image: "node:22-alpine",
    name: "app",
    ports: "3000:3000",
    env: "NODE_ENV=development",
    volumes: "./:/app",
    workdir: "/app",
    user: "node",
    command: "npm start",
  }),
  containerPreset("python", "Python", {
    image: "python:3.13-slim",
    name: "app",
    ports: "8000:8000",
    env: "PYTHONUNBUFFERED=1",
    volumes: "./:/app",
    workdir: "/app",
    command: "python -m http.server 8000",
  }),
  containerPreset("postgres", "PostgreSQL", {
    image: "postgres:17-alpine",
    name: "db",
    ports: "127.0.0.1:5432:5432",
    env: "POSTGRES_USER=app\nPOSTGRES_DB=app\nPOSTGRES_PASSWORD",
    volumes: "pgdata:/var/lib/postgresql/data",
    restart: "unless-stopped",
    healthCmd: "pg_isready -U app -d app",
    healthInterval: "10s",
  }),
  containerPreset("mongo", "MongoDB", {
    image: "mongo:8",
    name: "mongo",
    ports: "127.0.0.1:27017:27017",
    env: "MONGO_INITDB_ROOT_USERNAME=root\nMONGO_INITDB_ROOT_PASSWORD",
    volumes: "mongodata:/data/db",
    restart: "unless-stopped",
  }),
  containerPreset("redis", "Redis", {
    image: "redis:7-alpine",
    name: "redis",
    ports: "127.0.0.1:6379:6379",
    volumes: "redisdata:/data",
    restart: "unless-stopped",
    healthCmd: "redis-cli ping",
    healthInterval: "10s",
  }),
];

/** Shown with presets whose passwords are passed through from the shell. */
export const PASS_THROUGH_NOTE = "Variables without a value, like POSTGRES_PASSWORD, are passed on from your shell: set them first, e.g. export POSTGRES_PASSWORD=… (PowerShell: $env:POSTGRES_PASSWORD = '…').";

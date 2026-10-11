/**
 * Local checks on the form: mistakes this tool can see without Docker, like malformed ports, clashing
 * names and references to services that don't exist. Docker validates more (image names, option
 * values, the host); `docker compose config` runs those checks.
 */
import { inferSecret } from "@/lib/tools/developer/env-parse";
import { lines, type ComposeProject, type Service } from "./model";
import { NAME, parsePort, parseVolume, type Port } from "./parse";

export type IssueField = "name" | "image" | "build" | "ports" | "environment" | "envFiles" | "volumes" | "networks" | "dependsOn" | "healthcheck";

export interface Issue {
  level: "error" | "warning";
  message: string;
  /** Unset for problems with the whole project. */
  serviceId?: string;
  field?: IssueField;
}

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const DURATION = /^(\d+(\.\d+)?(us|ms|s|m|h))+$/;
// Published database ports that are usually only meant for the other containers.
const DATABASE_PORTS = new Map([
  [5432, "PostgreSQL"],
  [3306, "MySQL"],
  [27017, "MongoDB"],
  [6379, "Redis"],
]);

function label(s: Service, index: number): string {
  return s.name.trim() ? `“${s.name.trim()}”` : `Service ${index + 1}`;
}

function findCycle(project: ComposeProject): string[] | null {
  const deps = new Map(project.services.map((s) => [s.name.trim(), s.dependsOn.map((d) => d.service)]));
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];
  function visit(name: string): string[] | null {
    if (state.get(name) === "done") return null;
    if (state.get(name) === "visiting") return [...path.slice(path.indexOf(name)), name];
    state.set(name, "visiting");
    path.push(name);
    for (const next of deps.get(name) ?? []) {
      if (!deps.has(next) || next === name) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(name, "done");
    return null;
  }
  for (const name of deps.keys()) {
    const cycle = visit(name);
    if (cycle) return cycle;
  }
  return null;
}

export function validateProject(project: ComposeProject): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], message: string, s?: Service, field?: IssueField) =>
    issues.push({ level, message, serviceId: s?.id, field });

  if (project.name.trim() && !/^[a-z0-9][a-z0-9_-]*$/.test(project.name.trim())) {
    add("error", "The project name may only use lower-case letters, digits, - and _, and must start with a letter or digit.");
  }
  if (!project.services.length) add("error", "Add at least one service.");

  const names = new Map<string, number>();
  for (const s of project.services) if (s.name.trim()) names.set(s.name.trim(), (names.get(s.name.trim()) ?? 0) + 1);

  // Host ports in use, by "ip/protocol/port", to catch two services publishing the same one.
  const published = new Map<string, string>();

  project.services.forEach((s, i) => {
    const who = label(s, i);
    const name = s.name.trim();

    if (!name) add("error", `${who} has no name.`, s, "name");
    else if (!NAME.test(name)) add("error", `${who}: names may only use letters, digits, _ . and -, and must start with a letter or digit.`, s, "name");
    else if (names.get(name)! > 1) add("error", `More than one service is called ${who}. Service names must be unique.`, s, "name");

    if (s.source === "image" && !s.image.trim()) add("error", `${who} needs an image, like nginx:1.27-alpine.`, s, "image");
    if (s.source === "build" && !s.buildContext.trim()) add("error", `${who} needs a build context, the folder with its Dockerfile.`, s, "build");
    const image = s.image.trim();
    if (image && /\s/.test(image)) add("error", `${who}: image names can't contain spaces.`, s, "image");
    else if (s.source === "image" && image && (image.endsWith(":latest") || !/:[^/]+$|@sha256:/.test(image))) {
      add("warning", `${who} uses ${image.endsWith(":latest") ? "the latest tag" : "no tag, so latest"}. Pin a version, like ${image.replace(/:latest$/, "")}:1.2, so rebuilds don't change it.`, s, "image");
    }

    // Ports
    const containerPorts = new Set<string>();
    for (const { value, line } of lines(s.ports)) {
      const parsed = parsePort(value);
      if (!parsed.ok) {
        add("error", `${who}, port line ${line}: ${parsed.error}`, s, "ports");
        continue;
      }
      const port: Port = parsed.value;
      const containerKey = `${port.container.start}-${port.container.end}/${port.protocol}`;
      if (containerPorts.has(containerKey)) add("warning", `${who} publishes container port ${port.container.start}/${port.protocol} more than once.`, s, "ports");
      containerPorts.add(containerKey);
      if (port.host) {
        for (let p = port.host.start; p <= port.host.end; p++) {
          // An address of 0.0.0.0 or none takes the port on every address, so it clashes with any address.
          const ip = port.hostIp && port.hostIp !== "0.0.0.0" ? port.hostIp : "*";
          const clash = [...published.keys()].find((k) => {
            const [kIp, kProto, kPort] = k.split("|");
            return kProto === port.protocol && Number(kPort) === p && (kIp === ip || kIp === "*" || ip === "*");
          });
          if (clash) {
            const other = published.get(clash)!;
            add("error", `Host port ${p}/${port.protocol} is published by both ${other} and ${who}. Each host port can only be used once.`, s, "ports");
            break;
          }
          published.set(`${ip}|${port.protocol}|${p}`, who);
        }
      }
      const db = DATABASE_PORTS.get(port.container.start);
      if (db && port.host && (!port.hostIp || port.hostIp === "0.0.0.0")) {
        add(
          "warning",
          `${who} publishes ${db} on port ${port.host.start} to every network your machine is on. Other services reach it by name without this; to reach it from your machine only, use 127.0.0.1:${port.host.start}:${port.container.start}.`,
          s,
          "ports",
        );
      }
    }

    // Environment
    const keys = new Set<string>();
    for (const v of s.environment) {
      const key = v.key.trim();
      if (!key) {
        if (v.value.trim()) add("error", `${who} has an environment value with no name.`, s, "environment");
        continue;
      }
      if (!ENV_KEY.test(key)) add("error", `${who}: “${key}” isn't a valid variable name. Use letters, digits and _, not starting with a digit.`, s, "environment");
      if (keys.has(key)) add("error", `${who} sets ${key} more than once.`, s, "environment");
      keys.add(key);
      if (!v.secret && v.value && inferSecret(key, v.value)) {
        add("warning", `${who}: ${key} looks like a secret but is written into compose.yaml. Mark it secret to read it from .env instead.`, s, "environment");
      }
    }

    for (const { value, line } of lines(s.envFiles)) {
      if (/\s/.test(value)) add("error", `${who}, env file line ${line}: “${value}” has spaces in it.`, s, "envFiles");
      else if (value === ".env.example") add("warning", `${who} reads .env.example, which holds placeholders. Point it at .env.`, s, "envFiles");
    }

    // Volumes
    const targets = new Set<string>();
    for (const { value, line } of lines(s.volumes)) {
      const parsed = parseVolume(value);
      if (!parsed.ok) {
        add("error", `${who}, volume line ${line}: ${parsed.error}`, s, "volumes");
        continue;
      }
      if (targets.has(parsed.value.target)) add("error", `${who} mounts two volumes at ${parsed.value.target}.`, s, "volumes");
      targets.add(parsed.value.target);
      if (parsed.value.source === "/var/run/docker.sock" || parsed.value.source === "/") {
        add("warning", `${who} mounts ${parsed.value.source}, which gives the container control of your machine. Only do this for tools you trust.`, s, "volumes");
      }
    }

    // Networks
    const networks = new Set<string>();
    for (const { value, line } of lines(s.networks)) {
      if (!NAME.test(value)) add("error", `${who}, network line ${line}: “${value}” isn't a valid network name.`, s, "networks");
      if (networks.has(value)) add("warning", `${who} lists the network ${value} twice.`, s, "networks");
      networks.add(value);
    }

    // depends_on
    for (const dep of s.dependsOn) {
      const target = project.services.find((t) => t.name.trim() === dep.service);
      if (!dep.service) continue;
      if (dep.service === name) add("error", `${who} depends on itself.`, s, "dependsOn");
      else if (!target) add("error", `${who} depends on “${dep.service}”, which isn't a service here.`, s, "dependsOn");
      else {
        if (dep.condition === "service_healthy" && !(target.healthcheck.enabled && target.healthcheck.test.trim())) {
          add("error", `${who} waits for “${dep.service}” to be healthy, but it has no health check, so it never will be.`, s, "dependsOn");
        }
        // A service with no networks is on "default"; ones on separate networks can't reach each other.
        const networksOf = (t: Service) => {
          const listed = lines(t.networks).map((l) => l.value);
          return listed.length ? listed : ["default"];
        };
        const theirs = networksOf(target);
        if (!networksOf(s).some((n) => theirs.includes(n))) {
          add("warning", `${who} depends on “${dep.service}” but they share no network, so they can't reach each other.`, s, "networks");
        }
      }
    }

    // Health check
    const h = s.healthcheck;
    if (h.enabled) {
      if (!h.test.trim()) add("error", `${who} has a health check with no command.`, s, "healthcheck");
      for (const [field, value] of [
        ["interval", h.interval],
        ["timeout", h.timeout],
        ["start period", h.startPeriod],
      ] as const) {
        if (value.trim() && !DURATION.test(value.trim())) add("error", `${who}: health check ${field} “${value}” isn't a duration like 10s or 1m30s.`, s, "healthcheck");
      }
      if (h.retries.trim() && !/^\d+$/.test(h.retries.trim())) add("error", `${who}: health check retries must be a whole number.`, s, "healthcheck");
    }
  });

  const cycle = findCycle(project);
  if (cycle) add("error", `depends_on goes round in a circle: ${cycle.join(" → ")}. Compose can't start any of them.`);

  return issues;
}

/**
 * compose.yaml and .env.example from the form. Keys always come in the same order, so the same form
 * gives the same file. Follows the Compose Specification: no top-level `version:`, which Compose
 * now ignores with a warning.
 */
import { Document, Scalar, isSeq } from "yaml";
import { lines, type ComposeProject, type Service } from "./model";
import { parseVolume } from "./parse";

/** Placeholder for a secret with no example value. */
export const SECRET_PLACEHOLDER = "change-me";

function buildConfig(s: Service): string | Record<string, string> {
  const context = s.buildContext.trim() || ".";
  return s.dockerfile.trim() ? { context, dockerfile: s.dockerfile.trim() } : context;
}

function environment(s: Service): Record<string, string> | undefined {
  const vars = s.environment.filter((v) => v.key.trim());
  if (!vars.length) return undefined;
  const env: Record<string, string> = {};
  // Compose reads $ as the start of a variable; $$ is a literal $.
  for (const v of vars) env[v.key.trim()] = v.secret ? `\${${v.key.trim()}}` : v.value.replace(/\$/g, "$$$$");
  return env;
}

function dependsOn(s: Service): string[] | Record<string, { condition: string }> | undefined {
  const deps = s.dependsOn.filter((d) => d.service);
  if (!deps.length) return undefined;
  // The short list says "started"; any other condition needs the long form.
  if (deps.every((d) => d.condition === "service_started")) return deps.map((d) => d.service);
  return Object.fromEntries(deps.map((d) => [d.service, { condition: d.condition }]));
}

function healthcheck(s: Service) {
  const h = s.healthcheck;
  if (!h.enabled || !h.test.trim()) return undefined;
  const out: Record<string, unknown> = { test: ["CMD-SHELL", h.test.trim()] };
  if (h.interval.trim()) out.interval = h.interval.trim();
  if (h.timeout.trim()) out.timeout = h.timeout.trim();
  if (/^\d+$/.test(h.retries.trim())) out.retries = Number(h.retries.trim());
  if (h.startPeriod.trim()) out.start_period = h.startPeriod.trim();
  return out;
}

const listOf = (text: string) => {
  const values = lines(text).map((l) => l.value);
  return values.length ? values : undefined;
};

function serviceConfig(s: Service): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined && value !== "") config[key] = value;
  };
  if (s.source === "build") set("build", buildConfig(s));
  set("image", s.image.trim() || undefined);
  set("command", s.command.trim());
  set("working_dir", s.workingDir.trim());
  set("restart", s.restart);
  set("ports", listOf(s.ports));
  set("env_file", listOf(s.envFiles));
  set("environment", environment(s));
  set("volumes", listOf(s.volumes));
  set("networks", listOf(s.networks));
  set("depends_on", dependsOn(s));
  set("healthcheck", healthcheck(s));
  return config;
}

/** Names in the order they're first used, each once. */
function firstSeen(names: string[]): string[] {
  return [...new Set(names)];
}

export function namedVolumes(project: ComposeProject): string[] {
  return firstSeen(
    project.services.flatMap((s) =>
      lines(s.volumes)
        .map((l) => parseVolume(l.value))
        .flatMap((v) => (v.ok && v.value.kind === "named" ? [v.value.source] : [])),
    ),
  );
}

export function networkNames(project: ComposeProject): string[] {
  return firstSeen(project.services.flatMap((s) => lines(s.networks).map((l) => l.value)));
}

export function generateCompose(project: ComposeProject): string {
  const root: Record<string, unknown> = {};
  if (project.name.trim()) root.name = project.name.trim();
  const services: Record<string, unknown> = {};
  for (const s of project.services) {
    // Unnamed and repeated services are reported by the checks; leave them out rather than write broken YAML.
    const name = s.name.trim();
    if (name && !(name in services)) services[name] = serviceConfig(s);
  }
  root.services = services;
  const volumes = namedVolumes(project);
  if (volumes.length) root.volumes = Object.fromEntries(volumes.map((v) => [v, null]));
  const networks = networkNames(project);
  if (networks.length) root.networks = Object.fromEntries(networks.map((n) => [n, null]));

  const doc = new Document(root);
  // Quote ports: YAML 1.1 parsers read an unquoted 22:22 as a base-60 number.
  for (const name of Object.keys(services)) {
    const ports = doc.getIn(["services", name, "ports"], true);
    if (isSeq(ports)) for (const item of ports.items) if (item instanceof Scalar) item.type = Scalar.QUOTE_DOUBLE;
  }
  return doc.toString({ indent: 2, indentSeq: true, lineWidth: 0, nullStr: "" });
}

export interface EnvExample {
  /** .env.example's contents, or "" when no variable is a secret. */
  text: string;
  keys: string[];
}

/**
 * .env.example for the secrets, which compose.yaml reads as ${KEY}. Values are the examples from the
 * form, never real secrets: the file is meant to be committed. A key used by several services is written once.
 */
export function generateEnvExample(project: ComposeProject): EnvExample {
  const seen = new Map<string, string>();
  for (const s of project.services) {
    for (const v of s.environment) {
      const key = v.key.trim();
      if (v.secret && key && !seen.has(key)) seen.set(key, v.value.trim() || SECRET_PLACEHOLDER);
    }
  }
  if (!seen.size) return { text: "", keys: [] };
  // Single quotes keep a value exactly as written; Compose doesn't expand $ inside them.
  const quote = (value: string) =>
    !/[\s#"'$\\]/.test(value) ? value : value.includes("'") ? `"${value.replace(/["\\]/g, "\\$&")}"` : `'${value}'`;
  const body = [...seen].map(([key, value]) => `${key}=${quote(value)}`).join("\n");
  return {
    text: `# Copy to .env and fill in real values. Keep .env out of version control.\n# Docker Compose reads .env from the project folder for the \${...} values in compose.yaml.\n${body}\n`,
    keys: [...seen.keys()],
  };
}

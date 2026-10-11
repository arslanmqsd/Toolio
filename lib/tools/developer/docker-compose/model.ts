/**
 * The Docker Compose Builder's form state. List fields (ports, volumes, env files, networks) are kept
 * as the text typed, one entry per line, so checks can point at a line and typing isn't disturbed.
 */

export type ServiceSource = "image" | "build";
export type RestartPolicy = "" | "no" | "always" | "unless-stopped" | "on-failure";
export type DependsOnCondition = "service_started" | "service_healthy" | "service_completed_successfully";

export interface EnvVar {
  id: string;
  key: string;
  /**
   * The value written into compose.yaml. For a secret, it's only an example for .env.example:
   * compose.yaml reads the real value from .env as ${KEY}.
   */
  value: string;
  secret: boolean;
}

export interface Dependency {
  service: string;
  condition: DependsOnCondition;
}

export interface HealthCheck {
  enabled: boolean;
  /** A shell command, run as CMD-SHELL. */
  test: string;
  interval: string;
  timeout: string;
  retries: string;
  startPeriod: string;
}

export interface Service {
  id: string;
  name: string;
  source: ServiceSource;
  /** Required for "image"; with "build", names the built image. */
  image: string;
  buildContext: string;
  dockerfile: string;
  command: string;
  workingDir: string;
  restart: RestartPolicy;
  ports: string;
  envFiles: string;
  environment: EnvVar[];
  volumes: string;
  networks: string;
  dependsOn: Dependency[];
  healthcheck: HealthCheck;
}

export interface ComposeProject {
  /** Top-level `name:`; Compose uses the folder name when it's left out. */
  name: string;
  services: Service[];
}

export const NO_HEALTHCHECK: HealthCheck = { enabled: false, test: "", interval: "", timeout: "", retries: "", startPeriod: "" };

/** Makes ids; templates take one so the same template always gives the same ids, on server and client. */
export type MakeId = () => string;

export function sequentialIds(prefix = "id"): MakeId {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export function blankService(makeId: MakeId, name = ""): Service {
  return {
    id: makeId(),
    name,
    source: "image",
    image: "",
    buildContext: ".",
    dockerfile: "",
    command: "",
    workingDir: "",
    restart: "unless-stopped",
    ports: "",
    envFiles: "",
    environment: [],
    volumes: "",
    networks: "",
    dependsOn: [],
    healthcheck: { ...NO_HEALTHCHECK },
  };
}

/** The non-empty lines of a list field, with their line numbers from 1. */
export function lines(text: string): { value: string; line: number }[] {
  return text
    .split(/\r?\n/)
    .map((value, i) => ({ value: value.trim(), line: i + 1 }))
    .filter((l) => l.value);
}

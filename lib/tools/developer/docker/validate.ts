/** Checks for the values Docker commands take. Each returns why a value is wrong, or null. */
import { inferSecret } from "@/lib/tools/developer/env-parse";
import { parsePort, parseVolume } from "@/lib/tools/developer/docker-compose/parse";

// [registry[:port]/]path[:tag][@digest], as `docker` accepts. Path components are lower case.
const COMPONENT = "[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*";
const IMAGE = new RegExp(
  `^(?:[a-zA-Z0-9.-]+(?::\\d+)?/)?${COMPONENT}(?:/${COMPONENT})*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$`,
);

export function imageError(value: string): string | null {
  if (/\s/.test(value)) return "Image names can't contain spaces.";
  if (/[A-Z]/.test(value.split(":")[0].split("/").slice(-1)[0])) return "Image names must be lower case, like my-app:1.0.";
  return IMAGE.test(value) ? null : "Not an image name. Use name:tag, like nginx:1.27 or ghcr.io/me/app:1.0.";
}

/** Images separated by spaces. */
export function imagesError(value: string): string | null {
  for (const image of value.split(/\s+/)) {
    const error = imageError(image);
    if (error) return `${image}: ${error}`;
  }
  return null;
}

const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export function nameError(value: string): string | null {
  return NAME.test(value) ? null : "Use letters, digits, _ . and -, starting with a letter or digit.";
}

/** Container (or volume, or network) names or ids, separated by spaces. */
export function namesError(value: string): string | null {
  const bad = value.split(/\s+/).find((n) => !NAME.test(n));
  return bad ? `“${bad}” isn't a valid name or id.` : null;
}

export function portError(value: string): string | null {
  const parsed = parsePort(value);
  return parsed.ok ? null : parsed.error;
}

/** -v mounts. Same short syntax as in Compose. */
export function volumeError(value: string): string | null {
  const parsed = parseVolume(value);
  return parsed.ok ? null : parsed.error;
}

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** KEY=value, or a bare KEY to pass the variable through from the shell. */
export function envLineError(value: string): string | null {
  const key = value.split("=")[0];
  return ENV_KEY.test(key) ? null : `“${key}” isn't a variable name. Use letters, digits and _, not starting with a digit.`;
}

/** Variables given a value on the command line that look like secrets. */
export function secretEnvKeys(lines: string[]): string[] {
  return lines.flatMap((line) => {
    const eq = line.indexOf("=");
    if (eq === -1) return [];
    const key = line.slice(0, eq);
    return inferSecret(key, line.slice(eq + 1)) ? [key] : [];
  });
}

export function memoryError(value: string): string | null {
  return /^\d+(\.\d+)?[bkmg]?$/i.test(value) ? null : "Use a number with b, k, m or g, like 512m or 2g.";
}

export function cpusError(value: string): string | null {
  return /^(\d+(\.\d+)?|\.\d+)$/.test(value) && Number(value) > 0 ? null : "Use a number of CPUs, like 1 or 0.5.";
}

/** user, uid, user:group or uid:gid. */
export function userError(value: string): string | null {
  return /^[a-z_][a-z0-9_-]*\$?(?::[a-z_][a-z0-9_-]*)?$|^\d+(?::\d+)?$/i.test(value) ? null : "Use a user name or id, optionally with a group: 1000:1000 or node.";
}

export function durationError(value: string): string | null {
  return /^(\d+(\.\d+)?(ns|us|ms|s|m|h))+$/.test(value) ? null : "Use a duration like 30s, 5m or 1h30m.";
}

/** A time for --since or --until: a duration back from now (10m), or a date (2024-06-01). */
export function sinceError(value: string): string | null {
  if (!durationError(value) || /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/.test(value) || /^\d+$/.test(value)) return null;
  return "Use a duration like 10m or 2h, or a date like 2024-06-01.";
}

export function integerError(min: number) {
  return (value: string): string | null => (/^\d+$/.test(value) && Number(value) >= min ? null : `Use a whole number from ${min}.`);
}

/** A path or other single-line value. */
export function singleLineError(value: string): string | null {
  return /[\r\n]/.test(value) ? "Must be on one line." : null;
}

export function cidrError(value: string): string | null {
  return /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$|^[0-9a-f:]+\/\d{1,3}$/i.test(value) ? null : "Use a subnet in CIDR form, like 172.28.0.0/16.";
}

/** A shell variable name, for reading a token from the environment. */
export function envVarNameError(value: string): string | null {
  return ENV_KEY.test(value) ? null : "Use a variable name like REGISTRY_TOKEN.";
}

export function platformError(value: string): string | null {
  return /^[a-z0-9]+\/[a-z0-9_]+(\/[a-z0-9]+)?$/.test(value) ? null : "Use os/arch, like linux/amd64 or linux/arm64.";
}

export function registryError(value: string): string | null {
  return /^[a-zA-Z0-9.-]+(:\d+)?$/.test(value) ? null : "Use a host name, like ghcr.io or registry.example.com:5000, without https://.";
}

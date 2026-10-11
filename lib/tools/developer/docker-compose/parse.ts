/** Reads Compose's short syntax for ports and volumes, explaining what's wrong when it can't. */

export interface PortRange {
  start: number;
  end: number;
}

export interface Port {
  hostIp: string;
  /** Null when Docker picks the host port. */
  host: PortRange | null;
  container: PortRange;
  protocol: "tcp" | "udp" | "sctp";
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const RANGE = /^(\d+)(?:-(\d+))?$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function parseRange(text: string, what: string): Parsed<PortRange> {
  const match = RANGE.exec(text);
  if (!match) return { ok: false, error: `“${text}” isn't a ${what} port or range like 8080 or 8000-8010.` };
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  for (const n of [start, end]) if (n < 1 || n > 65535) return { ok: false, error: `${n} is outside 1–65535.` };
  if (end < start) return { ok: false, error: `The range ${text} runs backwards.` };
  return { ok: true, value: { start, end } };
}

/** `[[IP:]HOST:]CONTAINER[/PROTOCOL]`, e.g. 8080:80, 127.0.0.1:5432:5432, [::1]:80:80, 53:53/udp. */
export function parsePort(text: string): Parsed<Port> {
  let rest = text;
  let protocol: Port["protocol"] = "tcp";
  const slash = rest.lastIndexOf("/");
  if (slash !== -1) {
    const p = rest.slice(slash + 1).toLowerCase();
    if (p !== "tcp" && p !== "udp" && p !== "sctp") return { ok: false, error: `Unknown protocol “${rest.slice(slash + 1)}”. Use tcp, udp or sctp.` };
    protocol = p;
    rest = rest.slice(0, slash);
  }

  let hostIp = "";
  const v6 = /^\[([0-9a-fA-F:.]+)\]:(.*)$/.exec(rest);
  if (v6) {
    hostIp = v6[1];
    rest = v6[2];
    if (!rest.includes(":")) return { ok: false, error: "After an IPv6 address, give HOST:CONTAINER, e.g. [::1]:8080:80." };
  }
  const parts = rest.split(":");
  if (parts.length > 3) return { ok: false, error: "Too many colons. Wrap IPv6 addresses in brackets, e.g. [::1]:8080:80." };
  if (parts.length === 3) {
    if (hostIp) return { ok: false, error: "Too many colons after the IPv6 address." };
    hostIp = parts.shift()!;
  }
  if (hostIp && !v6 && !IPV4.test(hostIp)) return { ok: false, error: `“${hostIp}” isn't an IP address.` };

  const containerText = parts.pop()!;
  const hostText = parts.pop();
  const container = parseRange(containerText, "container");
  if (!container.ok) return container;
  let host: PortRange | null = null;
  if (hostText) {
    const parsed = parseRange(hostText, "host");
    if (!parsed.ok) return parsed;
    host = parsed.value;
    const hostSize = host.end - host.start;
    const containerSize = container.value.end - container.value.start;
    if (containerSize > 0 && hostSize !== containerSize) return { ok: false, error: "The host and container ranges are different sizes." };
  } else if (hostText === "" && !hostIp) {
    return { ok: false, error: "Nothing before the colon. Use HOST:CONTAINER, or just CONTAINER." };
  }
  return { ok: true, value: { hostIp, host, container: container.value, protocol } };
}

export interface Volume {
  kind: "named" | "bind" | "anonymous";
  source: string;
  target: string;
  mode: string;
}

const VOLUME_MODES = new Set(["ro", "rw", "z", "Z", "cached", "delegated", "consistent", "nocopy"]);
export const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

const isPath = (source: string) => /^(\/|\.|~)/.test(source);

/** `[SOURCE:]TARGET[:MODE]`: a named volume (db-data:/data), a bind mount (./src:/app:ro) or an anonymous volume (/data). */
export function parseVolume(text: string): Parsed<Volume> {
  const parts = text.split(":");
  let source = "";
  let target: string;
  let mode = "";
  if (parts.length === 1) target = parts[0];
  else if (parts.length === 2) {
    // "/data:ro" is an anonymous volume with a mode; anything else is SOURCE:TARGET.
    if (parts[0].startsWith("/") && parts[1].split(",").every((m) => VOLUME_MODES.has(m))) [target, mode] = parts;
    else [source, target] = parts;
  } else if (parts.length === 3) [source, target, mode] = parts;
  else return { ok: false, error: "Too many colons. Use SOURCE:TARGET or SOURCE:TARGET:MODE." };

  if (!target) return { ok: false, error: "No path inside the container." };
  if (!target.startsWith("/")) return { ok: false, error: `The path inside the container, “${target}”, must start with /.` };
  for (const m of mode ? mode.split(",") : []) {
    if (!VOLUME_MODES.has(m)) return { ok: false, error: `Unknown mode “${m}”. Use ro, rw, z, Z or nocopy.` };
  }
  if (!source) return { ok: true, value: { kind: "anonymous", source, target, mode } };
  if (isPath(source)) return { ok: true, value: { kind: "bind", source, target, mode } };
  if (source.includes("/")) return { ok: false, error: `“${source}” looks like a folder. Start relative paths with ./, like ./${source}.` };
  if (!NAME.test(source)) return { ok: false, error: `“${source}” isn't a valid volume name. Use letters, digits, _ . and -.` };
  return { ok: true, value: { kind: "named", source, target, mode } };
}

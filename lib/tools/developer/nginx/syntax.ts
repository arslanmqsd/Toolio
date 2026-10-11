/**
 * Writing values into nginx config safely, and checking them first. A value with spaces, quotes or
 * one of ; { } # is wrapped in double quotes with \ and " escaped. A literal $ can't be escaped in
 * most directives (nginx reads it as a variable), so fields that take literal text reject it instead.
 */

const BARE = /^[A-Za-z0-9_\-./:@*~=+,%[\]^|?()!<>]+$/;

export function nginxValue(value: string): string {
  return value !== "" && BARE.test(value) ? value : quoted(value);
}

/** Always in double quotes, for values that read better quoted, like header values. */
export const quoted = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Why a literal value can't go into the config, or null. */
export function literalError(value: string): string | null {
  if (/[\r\n]/.test(value)) return "Must be on one line.";
  if (/[\x00-\x1f]/.test(value)) return "Contains control characters.";
  if (value.includes("$")) return "Can't contain $: nginx would read it as a variable.";
  return null;
}

const LABEL = "[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?";
const HOSTNAME = new RegExp(`^(?:\\*\\.)?(?:${LABEL}\\.)*${LABEL}$`);
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function serverNameError(name: string): string | null {
  if (name === "_" || name === "localhost") return null;
  if (name.startsWith("~")) return "Regex server names aren't supported here; list the names instead.";
  // ".example.com" is nginx shorthand for example.com and *.example.com.
  if (name.startsWith(".")) return HOSTNAME.test(name.slice(1)) ? null : `“${name}” isn't a domain name.`;
  if (/^https?:\/\//i.test(name)) return `Leave out ${name.split("//")[0]}//: server_name takes just the domain.`;
  if (name.includes("/") || name.includes(":")) return `“${name}” isn't a domain name. Leave out paths and ports.`;
  if (IPV4.test(name)) return null;
  if (name.length > 253 || !HOSTNAME.test(name)) return `“${name}” isn't a domain name.`;
  return null;
}

export function portError(value: string): string | null {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535 ? null : "Use a port from 1 to 65535.";
}

/** An absolute file system path. */
export function pathError(value: string): string | null {
  const literal = literalError(value);
  if (literal) return literal;
  return value.startsWith("/") ? null : "Use an absolute path, starting with /.";
}

export function sizeError(value: string): string | null {
  return /^\d+[kKmMgG]?$/.test(value) ? null : "Use a size like 10m, 512k or 1g.";
}

export function timeError(value: string): string | null {
  return /^(\d+(ms|s|m|h|d|w|M|y)?)+$/.test(value) && /\d/.test(value) ? null : "Use a time like 60s, 5m or 1h.";
}

export function rateError(value: string): string | null {
  return /^\d+r\/[sm]$/.test(value) && !value.startsWith("0") ? null : "Use requests per second or minute, like 10r/s or 60r/m.";
}

/** An upstream server: host:port, [ipv6]:port, or unix:/path. */
export function upstreamAddressError(value: string): string | null {
  if (value.startsWith("unix:")) return pathError(value.slice(5)) ? "Use unix:/path/to.sock." : null;
  if (/^https?:\/\//i.test(value)) return "Leave out http://: upstream servers are host:port.";
  const v6 = /^\[([0-9a-fA-F:.]+)\](?::(\d+))?$/.exec(value);
  if (v6) return v6[2] ? portError(v6[2]) : null;
  const [host, port, extra] = value.split(":");
  if (extra !== undefined) return "Wrap IPv6 addresses in brackets, like [::1]:3000.";
  if (!host || !(IPV4.test(host) || HOSTNAME.test(host) || host === "localhost")) return `“${host}” isn't a host name or IP address.`;
  return port === undefined ? null : portError(port);
}

/** A URL to proxy to, like http://127.0.0.1:3000 or https://api.example.com/v1/. */
export function proxyUrlError(value: string): string | null {
  const literal = literalError(value);
  if (literal) return literal;
  const match = /^(https?):\/\/([^/\s]+)(\/.*)?$/.exec(value);
  if (!match) return "Use a URL starting with http:// or https://, like http://127.0.0.1:3000.";
  return upstreamAddressError(match[2]);
}

/** A redirect target: a full URL, or a path on this site. */
export function redirectError(value: string): string | null {
  if (/[\s"'{};]/.test(value)) return "Can't contain spaces, quotes or ; { }.";
  if (/^https?:\/\/[^/\s]+/i.test(value) || value.startsWith("/")) return null;
  return "Use a full URL (https://…) or a path starting with /.";
}

export const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function nameError(value: string): string | null {
  return NAME.test(value) ? null : "Use letters, digits, _ and -, starting with a letter.";
}

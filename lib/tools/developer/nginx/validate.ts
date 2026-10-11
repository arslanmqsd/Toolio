/**
 * Local checks on the form: syntax this tool can see and common nginx mistakes. They aren't nginx -t,
 * which also loads modules, checks files and certificates exist, and resolves upstream host names.
 */
import { usesRoot, usesUpstream, type Location, type NginxConfig } from "./model";
import {
  literalError,
  nameError,
  pathError,
  portError,
  proxyUrlError,
  rateError,
  redirectError,
  serverNameError,
  sizeError,
  timeError,
  upstreamAddressError,
} from "./syntax";

export type ConfigField =
  | "serverNames"
  | "httpPort"
  | "httpsPort"
  | "certificate"
  | "certificateKey"
  | "hsts"
  | "root"
  | "index"
  | "upstreamName"
  | "upstreamKeepalive"
  | "clientMaxBodySize"
  | "timeouts"
  | "accessLog"
  | "errorLog"
  | "rateLimit";

export interface Issue {
  level: "error" | "warning" | "info";
  message: string;
  field?: ConfigField;
  locationId?: string;
  upstreamId?: string;
}

const MATCH_LABEL: Record<Location["match"], string> = { prefix: "", exact: "= ", preferred: "^~ ", regex: "~ ", regexCaseless: "~* " };
export const locationLabel = (l: Location) => `location ${MATCH_LABEL[l.match]}${l.path.trim() || "(no path)"}`;

const isRegex = (l: Location) => l.match === "regex" || l.match === "regexCaseless";

/** Whether a proxy_pass URL has a path after the host (even just "/"). */
const hasUri = (url: string) => /^https?:\/\/[^/]+\/.*/.test(url);

function locationIssues(c: NginxConfig, l: Location, add: (level: Issue["level"], message: string) => void) {
  const label = locationLabel(l);
  const path = l.path.trim();
  if (!path) add("error", `A location has no path.`);
  else if (isRegex(l)) {
    // JavaScript's regex syntax is close to PCRE's; a pattern it can't read is very likely wrong for nginx too.
    try {
      new RegExp(path);
    } catch {
      add("error", `${label}: the regular expression doesn't look valid.`);
    }
    if (/[\r\n]/.test(path)) add("error", `${label}: must be on one line.`);
  } else {
    const literal = literalError(path);
    if (literal) add("error", `${label}: ${literal}`);
    else if (!path.startsWith("/") && !path.startsWith("@")) add("error", `${label}: paths start with /.`);
    else if (/\s/.test(path)) add("warning", `${label}: has a space; URLs encode spaces as %20, so check this matches.`);
  }

  if (l.kind === "proxy") {
    if (l.proxyTarget === "upstream") {
      if (l.proxyPath.trim() && !l.proxyPath.trim().startsWith("/")) add("error", `${label}: the path after the upstream must start with /.`);
      if (l.proxyPath.trim() && isRegex(l)) add("error", `${label}: nginx doesn't allow a path in proxy_pass inside a regex location. Leave it empty.`);
    } else {
      const error = proxyUrlError(l.proxyTarget.trim());
      if (error) add("error", `${label}: ${error}`);
      else if (hasUri(l.proxyTarget.trim()) && isRegex(l)) add("error", `${label}: nginx doesn't allow a path in proxy_pass inside a regex location. Use just http://host:port.`);
    }
    const target = l.proxyTarget === "upstream" ? `http://up${l.proxyPath.trim()}` : l.proxyTarget.trim();
    if (!isRegex(l) && l.match !== "exact" && hasUri(target) && path.endsWith("/") !== target.endsWith("/")) {
      add("warning", `${label}: with a path in proxy_pass, nginx replaces the matched ${path} with it. One ends in / and the other doesn't, so URLs may come out joined wrongly, like /apiusers.`);
    }
    if (l.websocket && c.proxyReadTimeout.trim() && /^\d+s?$/.test(c.proxyReadTimeout.trim()) && Number(c.proxyReadTimeout.replace("s", "")) < 60) {
      add("warning", `${label}: WebSocket connections close after ${c.proxyReadTimeout.trim()} without a message; use a longer read timeout or have the app send pings.`);
    }
  }

  if (l.kind === "spa") {
    add("info", `${label}: every unknown path gets index.html with status 200, so search engines and monitoring never see a 404. Serve assets from their own location (like /assets/) so a missing file still returns 404.`);
    if (l.path.trim() !== "/" || l.match !== "prefix") add("warning", `${label}: the single-page app fallback is usually on location /.`);
  }

  if (l.kind === "redirect") {
    const error = redirectError(l.redirectTo.trim());
    if (!l.redirectTo.trim()) add("error", `${label}: where should it redirect to?`);
    else if (error) add("error", `${label}: ${error}`);
    if (l.redirectCode === "301" || l.redirectCode === "308") add("info", `${label}: browsers cache permanent (${l.redirectCode}) redirects, so a mistake is hard to undo. Test with 302 first.`);
  }

  if (l.rateLimit && !c.rateLimit) add("warning", `${label} is set to rate-limit, but rate limiting is off.`);
}

export function validateConfig(c: NginxConfig): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], message: string, extra: Omit<Issue, "level" | "message"> = {}) => issues.push({ level, message, ...extra });

  // Server
  const names = c.serverNames.split(/\s+/).filter(Boolean);
  if (!names.length) add("warning", "No server name, so this becomes a catch-all (_) for any host name.", { field: "serverNames" });
  for (const name of names) {
    const error = serverNameError(name);
    if (error) add("error", error, { field: "serverNames" });
  }
  if (new Set(names).size !== names.length) add("warning", "A server name is listed twice.", { field: "serverNames" });
  const httpPort = portError(c.httpPort.trim());
  if (httpPort) add("error", `HTTP port: ${httpPort}`, { field: "httpPort" });
  if (c.https) {
    const httpsPort = portError(c.httpsPort.trim());
    if (httpsPort) add("error", `HTTPS port: ${httpsPort}`, { field: "httpsPort" });
    else if (c.httpsPort.trim() === c.httpPort.trim()) add("error", "HTTP and HTTPS can't use the same port.", { field: "httpsPort" });
    for (const [field, label] of [
      ["certificate", "Certificate"],
      ["certificateKey", "Certificate key"],
    ] as const) {
      const value = c[field].trim();
      if (!value) add("error", `${label} path is needed for HTTPS.`, { field });
      else {
        const error = pathError(value);
        if (error) add("error", `${label}: ${error}`, { field });
      }
    }
    if (names.includes("_")) add("warning", "With the catch-all name _, browsers get a certificate that doesn't match the host they asked for.", { field: "serverNames" });
    if (c.hsts) {
      add(
        "info",
        `HSTS makes browsers refuse plain HTTP for this site for a year${c.hstsSubdomains ? ", and for every subdomain, including ones without a certificate" : ""}. Turn it on once HTTPS works everywhere.`,
        { field: "hsts" },
      );
      if (c.hstsPreload) add("warning", "Preload asks browsers to build HSTS in: removal takes months. Only submit to hstspreload.org when you're sure, and it needs includeSubDomains.", { field: "hsts" });
      if (c.hstsPreload && !c.hstsSubdomains) add("error", "HSTS preload requires includeSubDomains.", { field: "hsts" });
    }
  } else if (c.hsts) {
    add("info", "HSTS only applies to HTTPS, so it's left out.", { field: "hsts" });
  }

  // Files
  if (usesRoot(c)) {
    if (!c.root.trim()) add("error", "Static locations need a document root.", { field: "root" });
    else {
      const error = pathError(c.root.trim());
      if (error) add("error", `Document root: ${error}`, { field: "root" });
      else if (/^\/(root|home)\b/.test(c.root.trim())) add("warning", "nginx's worker usually can't read files under /root or /home; /var/www is the usual place.", { field: "root" });
    }
  }
  for (const file of c.index.split(/\s+/).filter(Boolean)) {
    if (!/^[A-Za-z0-9._-]+$/.test(file)) add("error", `Index file “${file}” should be a plain file name, like index.html.`, { field: "index" });
  }

  // Upstream
  if (usesUpstream(c)) {
    const nameErr = nameError(c.upstreamName.trim());
    if (nameErr) add("error", `Upstream name: ${nameErr}`, { field: "upstreamName" });
    const servers = c.upstreamServers.filter((s) => s.address.trim());
    if (!servers.length) add("error", "Add at least one upstream server.", { field: "upstreamName" });
    if (servers.length && servers.every((s) => s.backup)) add("error", "Every upstream server is a backup, so none takes requests.", { field: "upstreamName" });
    const seen = new Set<string>();
    for (const s of servers) {
      const error = upstreamAddressError(s.address.trim());
      if (error) add("error", `Upstream server ${s.address.trim()}: ${error}`, { upstreamId: s.id });
      if (seen.has(s.address.trim())) add("warning", `Upstream server ${s.address.trim()} is listed twice.`, { upstreamId: s.id });
      seen.add(s.address.trim());
      if (s.weight.trim() && !(/^\d+$/.test(s.weight.trim()) && Number(s.weight.trim()) >= 1)) add("error", `Upstream server ${s.address.trim()}: weight must be a whole number from 1.`, { upstreamId: s.id });
    }
    if (c.upstreamKeepalive.trim() && !/^[1-9]\d*$/.test(c.upstreamKeepalive.trim())) add("error", "Keepalive connections must be a whole number.", { field: "upstreamKeepalive" });
  }

  // Limits and logs
  if (c.clientMaxBodySize.trim()) {
    const error = sizeError(c.clientMaxBodySize.trim());
    if (error) add("error", `Request body limit: ${error}`, { field: "clientMaxBodySize" });
    else if (/^0+[kKmMgG]?$/.test(c.clientMaxBodySize.trim())) add("warning", "A body limit of 0 turns the limit off, so uploads of any size are accepted.", { field: "clientMaxBodySize" });
  }
  for (const [value, label] of [
    [c.proxyConnectTimeout, "Connect timeout"],
    [c.proxySendTimeout, "Send timeout"],
    [c.proxyReadTimeout, "Read timeout"],
  ] as const) {
    if (value.trim() && timeError(value.trim())) add("error", `${label}: ${timeError(value.trim())}`, { field: "timeouts" });
  }
  if (c.proxyConnectTimeout.trim() && /^\d+s?$/.test(c.proxyConnectTimeout.trim()) && Number(c.proxyConnectTimeout.replace("s", "")) > 75) {
    add("warning", "nginx caps the connect timeout at 75s.", { field: "timeouts" });
  }
  if (c.accessLog.trim() && c.accessLog.trim() !== "off") {
    const error = pathError(c.accessLog.trim());
    if (error) add("error", `Access log: ${error}`, { field: "accessLog" });
  }
  if (c.errorLog.trim() === "off") add("error", "error_log off writes to a file named “off”; use /dev/null to discard errors.", { field: "errorLog" });
  else if (c.errorLog.trim()) {
    const error = pathError(c.errorLog.trim());
    if (error) add("error", `Error log: ${error}`, { field: "errorLog" });
  }

  if (c.locations.some((l) => l.kind === "proxy" && l.forwardedHeaders)) {
    add(
      "info",
      "X-Forwarded-For adds the client's address to whatever the client sent, so the app must only trust the last address, or X-Real-IP. Behind a CDN or load balancer, set real_ip_header and set_real_ip_from in nginx first.",
    );
  }

  // nginx resolves names in proxy_pass and upstream servers once, at start-up.
  const hosts = [
    ...c.locations.filter((l) => l.kind === "proxy" && l.proxyTarget !== "upstream").map((l) => /^https?:\/\/([^/:]+)/.exec(l.proxyTarget.trim())?.[1] ?? ""),
    ...(usesUpstream(c) ? c.upstreamServers.map((s) => (s.address.trim().startsWith("unix:") ? "" : s.address.trim().split(":")[0])) : []),
  ].filter((h) => h && h !== "localhost" && !/^[\d.]+$/.test(h) && !h.startsWith("["));
  if (hosts.length) {
    add("info", `nginx looks up ${[...new Set(hosts)].join(", ")} once, when it starts: if a name doesn't resolve then, nginx refuses to start, and later DNS changes aren't picked up until a reload.`);
  }

  // Rate limiting
  if (c.rateLimit) {
    const error = rateError(c.rateLimitRate.trim());
    if (error) add("error", `Rate: ${error}`, { field: "rateLimit" });
    if (c.rateLimitBurst.trim() && !/^\d+$/.test(c.rateLimitBurst.trim())) add("error", "Burst must be a whole number.", { field: "rateLimit" });
    if (!c.locations.some((l) => l.rateLimit)) add("warning", "Rate limiting is on, but no location uses it. Tick “Rate-limit” on the locations to protect.", { field: "rateLimit" });
    add("info", "Rate limits count per client IP address. Behind a CDN or load balancer every request comes from its address, so set up real_ip first.", { field: "rateLimit" });
  }

  // Locations
  if (!c.locations.length) add("warning", "No locations: nginx serves files from the root for every path.");
  const keys = new Set<string>();
  for (const l of c.locations) {
    const key = `${l.match === "preferred" ? "prefix" : l.match}|${l.path.trim()}`;
    if (l.path.trim() && keys.has(key)) add("error", `${locationLabel(l)} is defined twice; nginx refuses duplicate locations.`, { locationId: l.id });
    keys.add(key);
    locationIssues(c, l, (level, message) => add(level, message, { locationId: l.id }));
  }
  const hasRootLocation = c.locations.some((l) => l.path.trim() === "/" && (l.match === "prefix" || l.match === "preferred"));
  if (c.locations.length && !hasRootLocation && !c.locations.some(isRegex)) {
    add("info", "No location /, so requests that match nothing else are served as static files from the root.");
  }

  return issues;
}

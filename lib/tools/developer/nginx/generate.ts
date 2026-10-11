/**
 * nginx config from the form, following the nginx docs for which directive goes where. The site file
 * is meant for conf.d/ or sites-available/, which nginx includes inside http {}, so it may hold
 * upstream, map and limit_req_zone next to its server blocks. The full nginx.conf wraps it in events {}
 * and http {}.
 */
import { usesRoot, usesUpstream, type Location, type NginxConfig } from "./model";
import { nginxValue, quoted } from "./syntax";

const INDENT = "    ";

/** Collects lines with indentation, so blocks nest correctly. */
class Writer {
  private out: string[] = [];
  private depth = 0;

  line(text = "") {
    this.out.push(text ? INDENT.repeat(this.depth) + text : "");
  }

  directive(name: string, ...values: string[]) {
    this.line(`${[name, ...values].join(" ")};`);
  }

  block(head: string, body: () => void) {
    this.line(`${head} {`);
    this.depth++;
    body();
    this.depth--;
    this.line("}");
  }

  /** A blank line, unless the last one already is or the block just opened. */
  gap() {
    const last = this.out[this.out.length - 1];
    if (last !== undefined && last !== "" && !last.endsWith("{")) this.out.push("");
  }

  toString() {
    return this.out.join("\n") + "\n";
  }
}

export const RATE_LIMIT_ZONE = "per_ip";
export const SSL_SESSION_ZONE = "SSL";

const words = (text: string) => text.split(/\s+/).filter(Boolean);

const MATCH_PREFIX: Record<Location["match"], string> = { prefix: "", exact: "= ", preferred: "^~ ", regex: "~ ", regexCaseless: "~* " };

export const locationHead = (l: Location) => `location ${MATCH_PREFIX[l.match]}${nginxValue(l.path.trim())}`;

/** The response headers the server block sets, repeated in any location that sets its own. */
function serverHeaders(c: NginxConfig): [string, string][] {
  const headers: [string, string][] = [];
  if (c.securityHeaders) {
    headers.push(["X-Content-Type-Options", "nosniff"], ["X-Frame-Options", "SAMEORIGIN"], ["Referrer-Policy", "strict-origin-when-cross-origin"]);
  }
  if (c.https && c.hsts) {
    headers.push(["Strict-Transport-Security", `max-age=31536000${c.hstsSubdomains ? "; includeSubDomains" : ""}${c.hstsPreload ? "; preload" : ""}`]);
  }
  return headers;
}

const CACHE_HEADERS: Record<Location["cache"], [string, string][]> = {
  none: [],
  immutable: [["Cache-Control", "public, max-age=31536000, immutable"]],
  short: [["Cache-Control", "public, max-age=3600"]],
  noStore: [["Cache-Control", "no-store"]],
};

function addHeaders(w: Writer, headers: [string, string][]) {
  for (const [name, value] of headers) w.directive("add_header", name, quoted(value), "always");
}

/** Whether the WebSocket map's empty case should keep upstream keepalive working. */
const keepalive = (c: NginxConfig) => usesUpstream(c) && c.upstreamKeepalive.trim() !== "";

/** The upstream group plus an optional path, or the URL as typed. */
function proxyPass(c: NginxConfig, l: Location): string {
  return l.proxyTarget === "upstream" ? `http://${c.upstreamName.trim()}${l.proxyPath.trim()}` : l.proxyTarget.trim();
}

function writeLocation(w: Writer, c: NginxConfig, l: Location) {
  w.block(locationHead(l), () => {
    if (l.rateLimit && c.rateLimit) {
      w.directive("limit_req", `zone=${RATE_LIMIT_ZONE}`, `burst=${c.rateLimitBurst.trim() || "20"}`, "nodelay");
      // 429 Too Many Requests, rather than nginx's default 503, so clients know to slow down.
      w.directive("limit_req_status", "429");
    }
    switch (l.kind) {
      case "static":
        w.directive("try_files", "$uri", "$uri/", "=404");
        break;
      case "spa":
        // Unknown paths get the app's index.html, so client-side routes load on refresh.
        w.directive("try_files", "$uri", "$uri/", `/${words(c.index)[0] ?? "index.html"}`);
        break;
      case "redirect":
        w.directive("return", l.redirectCode, nginxValue(l.redirectTo.trim()));
        break;
      case "deny":
        w.directive("deny", "all");
        break;
      case "proxy": {
        w.directive("proxy_pass", nginxValue(proxyPass(c, l)));
        w.directive("proxy_http_version", "1.1");
        if (l.forwardedHeaders) {
          w.directive("proxy_set_header", "Host", "$host");
          w.directive("proxy_set_header", "X-Real-IP", "$remote_addr");
          w.directive("proxy_set_header", "X-Forwarded-For", "$proxy_add_x_forwarded_for");
          w.directive("proxy_set_header", "X-Forwarded-Proto", "$scheme");
        }
        if (l.websocket) {
          w.directive("proxy_set_header", "Upgrade", "$http_upgrade");
          w.directive("proxy_set_header", "Connection", "$connection_upgrade");
        } else if (l.proxyTarget === "upstream" && keepalive(c)) {
          // Keepalive to the upstream needs the client's Connection header cleared.
          w.directive("proxy_set_header", "Connection", '""');
        }
        if (c.proxyConnectTimeout.trim()) w.directive("proxy_connect_timeout", c.proxyConnectTimeout.trim());
        if (c.proxySendTimeout.trim()) w.directive("proxy_send_timeout", c.proxySendTimeout.trim());
        if (c.proxyReadTimeout.trim()) w.directive("proxy_read_timeout", c.proxyReadTimeout.trim());
        break;
      }
    }
    const cache = l.kind === "redirect" || l.kind === "deny" ? [] : CACHE_HEADERS[l.cache];
    if (cache.length) {
      if (l.cache === "immutable") w.directive("access_log", "off");
      // add_header in a location replaces every add_header from the server block, so repeat them.
      addHeaders(w, [...serverHeaders(c), ...cache]);
    }
  });
}

function listen(c: NginxConfig, port: string, ssl: boolean): string[] {
  const flags = ssl ? (c.http2 && c.legacyHttp2 ? " ssl http2" : " ssl") : "";
  const lines = [`${port}${flags}`];
  if (c.ipv6) lines.push(`[::]:${port}${flags}`);
  return lines;
}

/** The body of the site file: what goes in conf.d/, inside http {}. */
export function generateSite(c: NginxConfig): string {
  const w = new Writer();
  const names = words(c.serverNames).join(" ") || "_";
  const httpPort = c.httpPort.trim() || "80";
  const httpsPort = c.httpsPort.trim() || "443";
  const anyRateLimit = c.rateLimit && c.locations.some((l) => l.rateLimit);
  const anyWebsocket = c.locations.some((l) => l.kind === "proxy" && l.websocket);

  if (anyRateLimit) {
    w.line("# Requests per client IP address, shared by every location that uses limit_req.");
    w.directive("limit_req_zone", "$binary_remote_addr", `zone=${RATE_LIMIT_ZONE}:10m`, `rate=${c.rateLimitRate.trim()}`);
    w.gap();
  }

  if (anyWebsocket) {
    w.line("# Connection: upgrade for WebSocket requests, otherwise the usual value.");
    w.block("map $http_upgrade $connection_upgrade", () => {
      w.directive("default", "upgrade");
      w.directive("''", keepalive(c) ? '""' : "close");
    });
    w.gap();
  }

  if (usesUpstream(c)) {
    w.block(`upstream ${c.upstreamName.trim()}`, () => {
      for (const s of c.upstreamServers.filter((s) => s.address.trim())) {
        const params = [s.weight.trim() && s.weight.trim() !== "1" ? `weight=${s.weight.trim()}` : "", s.backup ? "backup" : ""].filter(Boolean);
        w.directive("server", s.address.trim(), ...params);
      }
      if (c.upstreamKeepalive.trim()) w.directive("keepalive", c.upstreamKeepalive.trim());
    });
    w.gap();
  }

  if (c.https && c.redirectToHttps) {
    w.block("server", () => {
      for (const l of listen(c, httpPort, false)) w.directive("listen", l);
      w.directive("server_name", names);
      w.directive("return", "301", httpsPort === "443" ? "https://$host$request_uri" : `https://$host:${httpsPort}$request_uri`);
    });
    w.gap();
  }

  w.block("server", () => {
    if (c.https) {
      for (const l of listen(c, httpsPort, true)) w.directive("listen", l);
      if (c.http2 && !c.legacyHttp2) w.directive("http2", "on");
      if (!c.redirectToHttps) for (const l of listen(c, httpPort, false)) w.directive("listen", l);
    } else {
      for (const l of listen(c, httpPort, false)) w.directive("listen", l);
    }
    w.directive("server_name", names);

    if (c.https) {
      w.gap();
      w.directive("ssl_certificate", nginxValue(c.certificate.trim()));
      w.directive("ssl_certificate_key", nginxValue(c.certificateKey.trim()));
      w.directive("ssl_protocols", "TLSv1.2", "TLSv1.3");
      w.directive("ssl_session_cache", `shared:${SSL_SESSION_ZONE}:10m`);
      w.directive("ssl_session_timeout", "1d");
    }

    if (usesRoot(c) || c.root.trim()) {
      w.gap();
      if (c.root.trim()) w.directive("root", nginxValue(c.root.trim()));
      if (words(c.index).length) w.directive("index", ...words(c.index).map(nginxValue));
    }

    const settings: [string, string][] = [];
    if (c.clientMaxBodySize.trim()) settings.push(["client_max_body_size", c.clientMaxBodySize.trim()]);
    if (c.hideVersion) settings.push(["server_tokens", "off"]);
    if (settings.length) {
      w.gap();
      for (const [name, value] of settings) w.directive(name, value);
    }

    if (c.accessLog.trim() || c.errorLog.trim()) {
      w.gap();
      if (c.accessLog.trim()) w.directive("access_log", c.accessLog.trim() === "off" ? "off" : nginxValue(c.accessLog.trim()));
      if (c.errorLog.trim()) w.directive("error_log", nginxValue(c.errorLog.trim()), "warn");
    }

    if (c.gzip) {
      w.gap();
      w.directive("gzip", "on");
      w.directive("gzip_vary", "on");
      w.directive("gzip_proxied", "any");
      w.directive("gzip_comp_level", "5");
      w.directive("gzip_min_length", "256");
      w.directive("gzip_types", "text/plain", "text/css", "application/javascript", "application/json", "application/xml", "image/svg+xml");
    }

    const headers = serverHeaders(c);
    if (headers.length) {
      w.gap();
      addHeaders(w, headers);
    }

    for (const l of c.locations) {
      w.gap();
      writeLocation(w, c, l);
    }
  });

  return w.toString();
}

/** A whole nginx.conf: the site file inside http {}, with the usual surroundings. */
export function generateFull(c: NginxConfig): string {
  const site = generateSite(c)
    .trimEnd()
    .split("\n")
    .map((line) => (line ? INDENT + line : ""))
    .join("\n");
  return `worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;

${site}
}
`;
}

/** The file name for the site file, from the first server name. */
export function siteFileName(c: NginxConfig): string {
  const first = words(c.serverNames).find((n) => n !== "_" && !n.startsWith("*"))?.replace(/^\./, "");
  return `${first || "default"}.conf`;
}

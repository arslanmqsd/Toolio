/** The Nginx Config Generator's form state. Generation reads only this, so the same form always gives the same file. */

export type LocationMatch = "prefix" | "exact" | "preferred" | "regex" | "regexCaseless";
export type LocationKind = "static" | "spa" | "proxy" | "redirect" | "deny";
export type CacheRule = "none" | "immutable" | "short" | "noStore";
export type RedirectCode = "301" | "302" | "307" | "308";

export interface Location {
  id: string;
  match: LocationMatch;
  /** A URI prefix or path, or a regular expression for the regex matches. */
  path: string;
  kind: LocationKind;
  /** proxy: "upstream" sends to the upstream group; anything else is a URL. */
  proxyTarget: string;
  /** proxy: an optional path after the upstream, e.g. "/" to strip the location's prefix. */
  proxyPath: string;
  websocket: boolean;
  forwardedHeaders: boolean;
  redirectTo: string;
  redirectCode: RedirectCode;
  cache: CacheRule;
  rateLimit: boolean;
}

export interface UpstreamServer {
  id: string;
  /** host:port, [ipv6]:port or unix:/path. */
  address: string;
  weight: string;
  backup: boolean;
}

export interface NginxConfig {
  /** server_name values, separated by spaces. */
  serverNames: string;
  httpPort: string;
  httpsPort: string;
  ipv6: boolean;
  https: boolean;
  redirectToHttps: boolean;
  http2: boolean;
  /** `listen … http2` for nginx before 1.25.1, which doesn't know `http2 on;`. */
  legacyHttp2: boolean;
  certificate: string;
  certificateKey: string;
  hsts: boolean;
  hstsSubdomains: boolean;
  hstsPreload: boolean;
  root: string;
  index: string;
  upstreamName: string;
  upstreamServers: UpstreamServer[];
  /** Idle connections to keep open to the upstream; empty for none. */
  upstreamKeepalive: string;
  locations: Location[];
  gzip: boolean;
  clientMaxBodySize: string;
  proxyConnectTimeout: string;
  proxyReadTimeout: string;
  proxySendTimeout: string;
  /** A path, or "off". */
  accessLog: string;
  errorLog: string;
  securityHeaders: boolean;
  rateLimit: boolean;
  /** Requests per second or minute: 10r/s, 60r/m. */
  rateLimitRate: string;
  rateLimitBurst: string;
  hideVersion: boolean;
}

export type MakeId = () => string;

export function sequentialIds(prefix = "id"): MakeId {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export function newLocation(makeId: MakeId, overrides: Partial<Omit<Location, "id">> = {}): Location {
  return {
    id: makeId(),
    match: "prefix",
    path: "/",
    kind: "static",
    proxyTarget: "upstream",
    proxyPath: "",
    websocket: false,
    forwardedHeaders: true,
    redirectTo: "",
    redirectCode: "301",
    cache: "none",
    rateLimit: false,
    ...overrides,
  };
}

export const newUpstreamServer = (makeId: MakeId, address = ""): UpstreamServer => ({ id: makeId(), address, weight: "", backup: false });

/** Everything off or empty, for templates to start from. */
export function baseConfig(): Omit<NginxConfig, "locations" | "upstreamServers"> {
  return {
    serverNames: "example.com www.example.com",
    httpPort: "80",
    httpsPort: "443",
    ipv6: true,
    https: false,
    redirectToHttps: true,
    http2: true,
    legacyHttp2: false,
    certificate: "/etc/letsencrypt/live/example.com/fullchain.pem",
    certificateKey: "/etc/letsencrypt/live/example.com/privkey.pem",
    hsts: false,
    hstsSubdomains: false,
    hstsPreload: false,
    root: "/var/www/example.com",
    index: "index.html",
    upstreamName: "app",
    upstreamKeepalive: "",
    gzip: true,
    clientMaxBodySize: "",
    proxyConnectTimeout: "",
    proxyReadTimeout: "",
    proxySendTimeout: "",
    accessLog: "/var/log/nginx/example.com.access.log",
    errorLog: "/var/log/nginx/example.com.error.log",
    securityHeaders: true,
    rateLimit: false,
    rateLimitRate: "10r/s",
    rateLimitBurst: "20",
    hideVersion: true,
  };
}

/** Whether any location sends requests to the upstream group, which then needs to be written. */
export const usesUpstream = (c: NginxConfig) => c.locations.some((l) => l.kind === "proxy" && l.proxyTarget === "upstream");

/** Whether any location serves files from the root. */
export const usesRoot = (c: NginxConfig) => c.locations.some((l) => l.kind === "static" || l.kind === "spa");

/** Starter configs and location presets. */
import { baseConfig, newLocation, newUpstreamServer, type Location, type MakeId, type NginxConfig } from "./model";

// Dotfiles like .git and .env, but not .well-known, which Let's Encrypt uses.
export const HIDDEN_FILES = "/\\.(?!well-known)";
export const ASSET_FILES = "\\.(?:css|js|mjs|png|jpe?g|gif|svg|ico|webp|avif|woff2?)$";

export interface LocationPreset {
  id: string;
  label: string;
  create: (makeId: MakeId) => Location;
}

export const LOCATION_PRESETS: LocationPreset[] = [
  { id: "static", label: "Static files", create: (makeId) => newLocation(makeId, { path: "/", kind: "static" }) },
  { id: "spa", label: "Single-page app fallback", create: (makeId) => newLocation(makeId, { path: "/", kind: "spa" }) },
  { id: "proxy", label: "Reverse proxy", create: (makeId) => newLocation(makeId, { path: "/api/", kind: "proxy" }) },
  { id: "websocket", label: "WebSocket proxy", create: (makeId) => newLocation(makeId, { path: "/ws/", kind: "proxy", websocket: true }) },
  { id: "assets", label: "Cache static assets", create: (makeId) => newLocation(makeId, { match: "regexCaseless", path: ASSET_FILES, kind: "static", cache: "immutable" }) },
  { id: "hidden", label: "Block hidden files (.git, .env)", create: (makeId) => newLocation(makeId, { match: "regex", path: HIDDEN_FILES, kind: "deny" }) },
  { id: "redirect", label: "Redirect", create: (makeId) => newLocation(makeId, { match: "exact", path: "/old-page", kind: "redirect", redirectTo: "/new-page" }) },
];

export interface Template {
  id: string;
  label: string;
  description: string;
  create: (makeId: MakeId) => NginxConfig;
}

export const TEMPLATES: Template[] = [
  {
    id: "static",
    label: "Static website",
    description: "Serves files from a folder, caches assets and hides dotfiles.",
    create: (makeId) => ({
      ...baseConfig(),
      upstreamServers: [newUpstreamServer(makeId, "127.0.0.1:3000")],
      locations: [
        newLocation(makeId, { path: "/", kind: "static" }),
        newLocation(makeId, { match: "regexCaseless", path: ASSET_FILES, kind: "static", cache: "short" }),
        newLocation(makeId, { match: "regex", path: HIDDEN_FILES, kind: "deny" }),
      ],
    }),
  },
  {
    id: "spa",
    label: "Single-page app",
    description: "React, Vue or Angular build: unknown paths load index.html; hashed assets cache for a year.",
    create: (makeId) => ({
      ...baseConfig(),
      root: "/var/www/example.com/dist",
      upstreamServers: [newUpstreamServer(makeId, "127.0.0.1:3000")],
      locations: [
        // Missing assets get a real 404 here instead of index.html from the fallback below.
        newLocation(makeId, { path: "/assets/", kind: "static", cache: "immutable" }),
        newLocation(makeId, { path: "/", kind: "spa", cache: "noStore" }),
        newLocation(makeId, { match: "regex", path: HIDDEN_FILES, kind: "deny" }),
      ],
    }),
  },
  {
    id: "proxy",
    label: "Reverse proxy",
    description: "Passes every request to an app server, like Node.js on port 3000.",
    create: (makeId) => ({
      ...baseConfig(),
      root: "",
      upstreamServers: [newUpstreamServer(makeId, "127.0.0.1:3000")],
      upstreamKeepalive: "32",
      clientMaxBodySize: "10m",
      proxyReadTimeout: "60s",
      locations: [newLocation(makeId, { path: "/", kind: "proxy" })],
    }),
  },
  {
    id: "https",
    label: "HTTPS website",
    description: "Static site on HTTPS with Let's Encrypt paths, HTTP redirected, HTTP/2 and HSTS.",
    create: (makeId) => ({
      ...baseConfig(),
      https: true,
      hsts: true,
      upstreamServers: [newUpstreamServer(makeId, "127.0.0.1:3000")],
      locations: [
        newLocation(makeId, { path: "/", kind: "static" }),
        newLocation(makeId, { match: "regexCaseless", path: ASSET_FILES, kind: "static", cache: "short" }),
        newLocation(makeId, { match: "regex", path: HIDDEN_FILES, kind: "deny" }),
      ],
    }),
  },
  {
    id: "api-gateway",
    label: "API gateway",
    description: "HTTPS in front of load-balanced API servers, with rate limiting, WebSockets and a health check.",
    create: (makeId) => ({
      ...baseConfig(),
      serverNames: "api.example.com",
      https: true,
      hsts: true,
      certificate: "/etc/letsencrypt/live/api.example.com/fullchain.pem",
      certificateKey: "/etc/letsencrypt/live/api.example.com/privkey.pem",
      root: "",
      accessLog: "/var/log/nginx/api.example.com.access.log",
      errorLog: "/var/log/nginx/api.example.com.error.log",
      upstreamName: "api",
      upstreamServers: [newUpstreamServer(makeId, "10.0.0.11:8080"), newUpstreamServer(makeId, "10.0.0.12:8080"), { ...newUpstreamServer(makeId, "10.0.0.13:8080"), backup: true }],
      upstreamKeepalive: "64",
      clientMaxBodySize: "5m",
      proxyConnectTimeout: "5s",
      proxyReadTimeout: "60s",
      proxySendTimeout: "30s",
      rateLimit: true,
      locations: [
        newLocation(makeId, { match: "exact", path: "/health", kind: "proxy" }),
        newLocation(makeId, { path: "/v1/", kind: "proxy", rateLimit: true }),
        newLocation(makeId, { path: "/ws/", kind: "proxy", websocket: true, rateLimit: true }),
        newLocation(makeId, { path: "/", kind: "deny" }),
      ],
    }),
  },
];

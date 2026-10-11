import { describe, expect, it } from "vitest";
import { generateFull, generateSite, siteFileName } from "./generate";
import { baseConfig, newLocation, newUpstreamServer, sequentialIds, type Location, type NginxConfig } from "./model";
import { TEMPLATES } from "./templates";

const makeId = sequentialIds();
const config = (overrides: Partial<NginxConfig> = {}, locations: Partial<Location>[] = [{}]): NginxConfig => ({
  ...baseConfig(),
  upstreamServers: [newUpstreamServer(makeId, "127.0.0.1:3000")],
  locations: locations.map((l) => newLocation(makeId, l)),
  ...overrides,
});
const site = (overrides: Partial<NginxConfig> = {}, locations?: Partial<Location>[]) => generateSite(config(overrides, locations));

describe("generateSite", () => {
  it("writes the reverse proxy template exactly", () => {
    expect(generateSite(TEMPLATES.find((t) => t.id === "proxy")!.create(sequentialIds()))).toBe(`upstream app {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    client_max_body_size 10m;
    server_tokens off;

    access_log /var/log/nginx/example.com.access.log;
    error_log /var/log/nginx/example.com.error.log warn;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/plain text/css application/javascript application/json application/xml image/svg+xml;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
    }
}
`);
  });

  it("redirects HTTP to HTTPS in its own server block, and sets up TLS", () => {
    const out = site({ https: true, httpsPort: "8443" });
    expect(out).toContain(`server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host:8443$request_uri;
}`);
    expect(out).toContain("    listen 8443 ssl;\n    listen [::]:8443 ssl;\n    http2 on;\n");
    expect(out).toContain("ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;");
    expect(out).toContain("ssl_protocols TLSv1.2 TLSv1.3;");
  });

  it("serves both HTTP and HTTPS from one block when not redirecting, and uses listen … http2 for old nginx", () => {
    const out = site({ https: true, redirectToHttps: false, legacyHttp2: true, ipv6: false });
    expect(out.match(/server \{/g)).toHaveLength(1);
    expect(out).toContain("    listen 443 ssl http2;\n    listen 80;\n");
    expect(out).not.toContain("http2 on;");
    expect(out).not.toContain("return 301");
  });

  it("writes HSTS only for HTTPS, with the chosen options", () => {
    expect(site({ hsts: true })).not.toContain("Strict-Transport-Security");
    expect(site({ https: true, hsts: true, hstsSubdomains: true, hstsPreload: true })).toContain(
      'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;',
    );
  });

  it("repeats server headers in a location that adds its own, as nginx doesn't inherit them", () => {
    const out = site({ https: true, hsts: true }, [{ path: "/assets/", cache: "immutable" }]);
    const location = out.slice(out.indexOf("location /assets/"));
    expect(location).toContain('add_header X-Content-Type-Options "nosniff" always;');
    expect(location).toContain("add_header Strict-Transport-Security");
    expect(location).toContain('add_header Cache-Control "public, max-age=31536000, immutable" always;');
    expect(location).toContain("access_log off;");
  });

  it("adds the WebSocket map, closing idle connections unless the upstream keeps them alive", () => {
    const ws = [{ kind: "proxy" as const, websocket: true }];
    expect(site({}, ws)).toContain("map $http_upgrade $connection_upgrade {\n    default upgrade;\n    '' close;\n}");
    expect(site({ upstreamKeepalive: "16" }, ws)).toContain("    '' \"\";\n");
    expect(site({}, ws)).toContain("proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection $connection_upgrade;");
    expect(site({}, [{ kind: "proxy" }])).not.toContain("map $http_upgrade");
  });

  it("writes the upstream only when a location uses it, with weights and backups", () => {
    expect(site()).not.toContain("upstream");
    const out = site({ upstreamServers: [newUpstreamServer(makeId, "10.0.0.1:80"), { ...newUpstreamServer(makeId, "10.0.0.2:80"), weight: "3" }, { ...newUpstreamServer(makeId, "10.0.0.3:80"), backup: true }, newUpstreamServer(makeId, " ")] }, [{ kind: "proxy" }]);
    expect(out).toContain("upstream app {\n    server 10.0.0.1:80;\n    server 10.0.0.2:80 weight=3;\n    server 10.0.0.3:80 backup;\n}");
  });

  it("proxies to a URL as typed, or to the upstream with a path", () => {
    expect(site({}, [{ kind: "proxy", proxyTarget: "http://127.0.0.1:8080/api/" }])).toContain("proxy_pass http://127.0.0.1:8080/api/;");
    expect(site({}, [{ path: "/api/", kind: "proxy", proxyPath: "/" }])).toContain("proxy_pass http://app/;");
    expect(site({}, [{ kind: "proxy", forwardedHeaders: false }])).not.toContain("X-Forwarded-For");
  });

  it("writes each location kind and match", () => {
    expect(site({}, [{ kind: "spa" }])).toContain("try_files $uri $uri/ /index.html;");
    expect(site({}, [{ kind: "static" }])).toContain("try_files $uri $uri/ =404;");
    expect(site({}, [{ match: "exact", path: "/old", kind: "redirect", redirectTo: "https://example.org/new", redirectCode: "308" }])).toContain(
      "location = /old {\n        return 308 https://example.org/new;\n    }",
    );
    expect(site({}, [{ match: "regex", path: "/\\.(?!well-known)", kind: "deny" }])).toContain('location ~ "/\\\\.(?!well-known)" {\n        deny all;');
    expect(site({}, [{ match: "regexCaseless", path: "\\.(png|jpe?g)$" }])).toContain('location ~* "\\\\.(png|jpe?g)$" {');
    expect(site({}, [{ match: "preferred", path: "/static/" }])).toContain("location ^~ /static/ {");
    expect(site({}, [{ match: "regex", path: "^/a{2}$" }])).toContain('location ~ "^/a{2}$" {');
  });

  it("adds rate limiting only where asked, and only when it's on", () => {
    expect(site({ rateLimit: false }, [{ rateLimit: true }])).not.toContain("limit_req");
    const out = site({ rateLimit: true, rateLimitRate: "5r/s", rateLimitBurst: "10" }, [{ path: "/api/", rateLimit: true }, { path: "/" }]);
    expect(out).toContain("limit_req_zone $binary_remote_addr zone=per_ip:10m rate=5r/s;");
    expect(out).toContain("location /api/ {\n        limit_req zone=per_ip burst=10 nodelay;\n        limit_req_status 429;");
    expect(out.match(/limit_req zone/g)).toHaveLength(1);
  });

  it("leaves out optional settings, and quotes paths with spaces", () => {
    const out = site({ gzip: false, securityHeaders: false, hideVersion: false, accessLog: "off", errorLog: "", root: "/srv/my site" });
    expect(out).not.toMatch(/gzip|add_header|server_tokens|error_log/);
    expect(out).toContain("access_log off;");
    expect(out).toContain('root "/srv/my site";');
  });

  it("falls back to the catch-all server name", () => {
    expect(site({ serverNames: "  " })).toContain("server_name _;");
  });
});

describe("generateFull", () => {
  it("wraps the site file in http {}, with events and mime types", () => {
    const c = config();
    const full = generateFull(c);
    expect(full).toMatch(/^worker_processes auto;\n\nevents \{\n    worker_connections 1024;\n\}\n\nhttp \{\n    include \/etc\/nginx\/mime.types;/);
    expect(full).toContain("\n    server {\n        listen 80;");
    expect(full.trimEnd().endsWith("}\n}")).toBe(true);
  });
});

describe("siteFileName", () => {
  it("names the file after the first real server name", () => {
    expect(siteFileName(config())).toBe("example.com.conf");
    expect(siteFileName(config({ serverNames: "_ *.example.org .example.net" }))).toBe("example.net.conf");
    expect(siteFileName(config({ serverNames: "_" }))).toBe("default.conf");
  });
});

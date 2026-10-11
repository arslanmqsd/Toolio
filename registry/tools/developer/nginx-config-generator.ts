import type { ToolConfig } from "@/registry/types";

const nginxConfigGenerator: ToolConfig = {
  id: "nginx-config-generator",
  category: "developer",
  title: "Nginx Config Generator",
  description: "Build nginx configs for static sites, SPAs, reverse proxies, HTTPS and API gateways, with checks for common mistakes.",
  keywords: [
    "nginx config generator",
    "nginx configuration",
    "nginx config",
    "nginx reverse proxy",
    "nginx server block",
    "nginx https config",
    "nginx ssl config",
    "nginx spa config",
    "nginx websocket proxy",
    "nginx load balancer",
    "nginx rate limit",
    "nginx.conf generator",
    "nginx redirect http to https",
  ],
  actions: ["generate"],
  component: () => import("@/components/tools/developer/NginxConfigGenerator"),
  consumes: [],
  produces: ["code"],
};

export default nginxConfigGenerator;

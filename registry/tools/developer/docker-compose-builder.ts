import type { ToolConfig } from "@/registry/types";

const dockerComposeBuilder: ToolConfig = {
  id: "docker-compose-builder",
  category: "developer",
  title: "Docker Compose Builder",
  description: "Build a compose.yaml with services, ports, volumes, health checks and secrets kept in .env. Starter stacks included.",
  keywords: [
    "docker compose builder",
    "docker compose generator",
    "compose.yaml generator",
    "docker-compose.yml generator",
    "docker compose file",
    "docker compose template",
    "docker compose postgres",
    "docker compose node",
    "docker compose django",
    "docker compose mongodb",
    "docker compose nginx",
    "docker compose validator",
    "docker compose healthcheck",
  ],
  actions: ["generate"],
  component: () => import("@/components/tools/developer/DockerComposeBuilder"),
  consumes: [],
  produces: ["yaml", "env"],
};

export default dockerComposeBuilder;

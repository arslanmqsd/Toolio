import type { ToolConfig } from "@/registry/types";

const dockerCommandBuilder: ToolConfig = {
  id: "docker-command-builder",
  category: "developer",
  title: "Docker Command Builder",
  description: "Build docker run, exec, build, prune and more for Bash or PowerShell, every flag explained, risky ones flagged.",
  keywords: [
    "docker command builder",
    "docker command generator",
    "docker run generator",
    "docker run command",
    "docker commands",
    "docker cheat sheet",
    "docker exec",
    "docker build command",
    "docker system prune",
    "docker login password-stdin",
    "docker volume rm",
    "docker powershell",
    "docker logs",
  ],
  actions: ["generate"],
  component: () => import("@/components/tools/developer/DockerCommandBuilder"),
  consumes: [],
  produces: ["docker"],
};

export default dockerCommandBuilder;

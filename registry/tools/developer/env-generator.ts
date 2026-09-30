import type { ToolConfig } from "@/registry/types";

const envGenerator: ToolConfig = {
  id: "env-generator",
  category: "developer",
  title: "Env Config Generator",
  description: "Turn a .env file into a typed, validated config loader for Node or Python.",
  keywords: [
    "env",
    ".env",
    "dotenv",
    "env file",
    "environment variables",
    "env vars",
    "typed config",
    "config loader",
    "validate env",
    "zod env",
    "env schema",
    "pydantic settings",
    "basesettings",
    "process.env types",
    "env example",
    ".env.example",
    "settings.py",
  ],
  actions: ["generate", "convert"],
  component: () => import("@/components/tools/developer/EnvGenerator"),
  consumes: ["text", "env"],
  produces: ["code", "text"],
};

export default envGenerator;

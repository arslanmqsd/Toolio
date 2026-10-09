import type { ToolConfig } from "@/registry/types";

const chmodCalculator: ToolConfig = {
  id: "chmod-calculator",
  category: "developer",
  title: "chmod Calculator",
  description: "Convert Unix permissions between 755 and rwxr-xr-x, see what they allow, and get a safe chmod command.",
  keywords: [
    "chmod",
    "chmod calculator",
    "linux file permissions",
    "unix permissions",
    "file permissions calculator",
    "chmod 755",
    "chmod 644",
    "chmod 777",
    "octal to symbolic permissions",
    "rwxr-xr-x",
    "permission bits",
    "setuid",
    "setgid",
    "sticky bit",
    "umask calculator",
    "chmod recursive",
  ],
  actions: ["calculate", "generate", "convert"],
  component: () => import("@/components/tools/developer/ChmodCalculator"),
  consumes: [],
  produces: ["code"],
};

export default chmodCalculator;

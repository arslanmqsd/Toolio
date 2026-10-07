import type { ToolConfig } from "@/registry/types";

const semverCalculator: ToolConfig = {
  id: "semver-calculator",
  category: "developer",
  title: "SemVer Calculator",
  description: "Check which versions fit an npm range like ^1.2.3, see what the range means, and compare or bump versions.",
  keywords: [
    "semver",
    "semver calculator",
    "semver comparator",
    "compare versions",
    "version comparison",
    "semver range checker",
    "npm semver",
    "npm version range",
    "caret range",
    "tilde range",
    "what does ^ mean in package.json",
    "does version satisfy range",
    "semantic versioning",
    "bump version",
    "sort versions",
  ],
  actions: ["compare", "inspect"],
  component: () => import("@/components/tools/developer/SemverCalculator"),
  consumes: ["text"],
  produces: ["text"],
};

export default semverCalculator;

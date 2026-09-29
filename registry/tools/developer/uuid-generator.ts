import type { ToolConfig } from "@/registry/types";

const uuidGenerator: ToolConfig = {
  id: "uuid-generator",
  category: "developer",
  title: "UUID Generator",
  description: "Generate v1, v4, or v7 UUIDs, one or thousands at a time.",
  keywords: [
    "uuid",
    "guid",
    "generate uuid",
    "uuid generator",
    "guid generator",
    "random id",
    "unique id",
    "uuid v4",
    "uuid v7",
    "uuid v1",
    "uuidv4",
    "uuidv7",
    "bulk uuid",
    "sortable id",
    "database primary key",
  ],
  actions: ["generate"],
  component: () => import("@/components/tools/developer/UuidGenerator"),
  consumes: [],
  produces: ["text", "uuid"],
};

export default uuidGenerator;

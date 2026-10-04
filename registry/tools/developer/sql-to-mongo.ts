import type { ToolConfig } from "@/registry/types";

const sqlToMongo: ToolConfig = {
  id: "sql-to-mongo",
  category: "developer",
  title: "SQL to MongoDB",
  description: "Convert a SQL SELECT query into a MongoDB find() call, with notes on anything that doesn't translate.",
  keywords: [
    "sql to mongodb",
    "sql to mongo",
    "convert sql query",
    "convert sql to mongodb",
    "mongodb query from sql",
    "mongo query from sql",
    "sql to nosql",
    "sql to mongodb find",
    "translate sql to mongo",
    "mongodb query builder",
    "select to find",
    "where clause to mongodb filter",
    "postgres to mongodb",
    "mysql to mongodb",
  ],
  actions: ["convert"],
  component: () => import("@/components/tools/developer/SqlToMongo"),
  consumes: ["sql"],
  produces: ["mongodb"],
};

export default sqlToMongo;

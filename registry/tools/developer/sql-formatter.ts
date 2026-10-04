import type { ToolConfig } from "@/registry/types";

const sqlFormatter: ToolConfig = {
  id: "sql-formatter",
  category: "developer",
  title: "SQL Formatter",
  description: "Format, beautify, or minify SQL queries for PostgreSQL, MySQL, SQLite, SQL Server, and Oracle.",
  keywords: [
    "sql formatter",
    "format sql",
    "format sql query",
    "sql beautifier",
    "beautify sql",
    "prettify sql",
    "pretty print sql",
    "clean up query",
    "clean up sql",
    "make sql readable",
    "indent sql",
    "minify sql",
    "compact sql",
    "sql to one line",
    "uppercase sql keywords",
    "postgres formatter",
    "mysql formatter",
    "sqlite formatter",
    "sql server formatter",
    "t-sql formatter",
    "oracle sql formatter",
    "pl/sql formatter",
  ],
  actions: ["format", "clean", "convert"],
  component: () => import("@/components/tools/developer/SqlFormatter"),
  consumes: ["sql"],
  produces: ["sql"],
};

export default sqlFormatter;

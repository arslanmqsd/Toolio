import type { ToolConfig } from "@/registry/types";

const unixTimestamp: ToolConfig = {
  id: "unix-timestamp",
  category: "developer",
  title: "Unix Timestamp Converter",
  description: "Convert Unix timestamps to dates in any time zone, and back.",
  keywords: [
    "unix timestamp",
    "epoch",
    "epoch time",
    "epoch converter",
    "unix time",
    "posix time",
    "timestamp to date",
    "date to timestamp",
    "convert timestamp",
    "milliseconds since 1970",
    "seconds since 1970",
    "what time is this timestamp",
    "current unix time",
    "time zone converter",
    "timezone",
    "utc",
    "iso 8601",
  ],
  actions: ["convert", "inspect"],
  component: () => import("@/components/tools/developer/UnixTimestamp"),
  consumes: ["text", "timestamp", "date"],
  produces: ["text", "timestamp", "date"],
};

export default unixTimestamp;

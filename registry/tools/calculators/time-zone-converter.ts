import type { ToolConfig } from "@/registry/types";

const timeZoneConverter: ToolConfig = {
  id: "time-zone-converter",
  category: "calculators",
  title: "Time Zone Converter",
  description: "Compare a date and time across time zones, see daylight-saving changes, and find meeting hours that work everywhere.",
  keywords: [
    "time zone converter",
    "timezone converter",
    "timezone",
    "world clock",
    "convert time zones",
    "what time is it in",
    "est to pst",
    "utc to est",
    "gmt to ist",
    "meeting planner",
    "meeting time across time zones",
    "best time for a meeting",
    "daylight saving time",
    "dst",
    "when do clocks change",
    "clocks go forward",
    "clocks go back",
    "utc offset",
  ],
  actions: ["convert", "calculate", "compare"],
  component: () => import("@/components/tools/calculators/TimeZoneConverter"),
  consumes: [],
  produces: [],
};

export default timeZoneConverter;

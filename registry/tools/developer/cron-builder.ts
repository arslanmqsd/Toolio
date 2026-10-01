import type { ToolConfig } from "@/registry/types";

const cronBuilder: ToolConfig = {
  id: "cron-builder",
  category: "developer",
  title: "Cron Expression Builder",
  description: "Build and explain cron schedules in plain English, and see the next run times in any time zone.",
  keywords: [
    "cron",
    "cron expression",
    "crontab",
    "cron generator",
    "cron builder",
    "cron parser",
    "cron explainer",
    "cron schedule",
    "cron syntax",
    "crontab guru",
    "every 5 minutes cron",
    "cron job",
    "next run time",
    "schedule expression",
    "github actions schedule",
    "kubernetes cronjob",
  ],
  actions: ["generate", "inspect"],
  component: () => import("@/components/tools/developer/CronBuilder"),
  consumes: ["cron"],
  produces: ["cron"],
};

export default cronBuilder;

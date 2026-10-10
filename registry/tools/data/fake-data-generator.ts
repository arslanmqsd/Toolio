import type { ToolConfig } from "@/registry/types";

const fakeDataGenerator: ToolConfig = {
  id: "fake-data-generator",
  category: "data",
  title: "Fake Data Generator",
  description: "Generate realistic fake names, emails, addresses and UUIDs as JSON or CSV for mock APIs and test databases.",
  keywords: [
    "fake data generator",
    "mock data generator",
    "test data generator",
    "dummy data",
    "sample data",
    "seed data",
    "random user generator",
    "fake name generator",
    "fake email generator",
    "fake address generator",
    "random address",
    "mock json",
    "mock api data",
    "sample csv",
    "fake users json",
    "faker",
  ],
  actions: ["generate"],
  component: () => import("@/components/tools/data/FakeDataGenerator"),
  consumes: [],
  produces: ["json", "csv"],
};

export default fakeDataGenerator;

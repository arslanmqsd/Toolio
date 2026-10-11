import type { ToolConfig } from "@/registry/types";

const ogPreview: ToolConfig = {
  id: "og-preview",
  category: "developer",
  title: "Open Graph Preview",
  description: "Preview link cards on Google, Facebook, X, LinkedIn, Slack and Discord, check your meta tags and generate them.",
  keywords: [
    "open graph preview",
    "og preview",
    "og image preview",
    "meta tag checker",
    "meta tag generator",
    "open graph generator",
    "twitter card preview",
    "twitter card validator",
    "x card preview",
    "link preview",
    "social media preview",
    "seo meta tags",
    "facebook link preview",
    "linkedin post preview",
  ],
  actions: ["inspect", "generate"],
  component: () => import("@/components/tools/developer/OgPreview"),
  consumes: ["html"],
  produces: ["html"],
};

export default ogPreview;

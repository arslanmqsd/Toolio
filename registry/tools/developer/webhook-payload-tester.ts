import type { ToolConfig } from "@/registry/types";

const webhookPayloadTester: ToolConfig = {
  id: "webhook-payload-tester",
  category: "developer",
  title: "Webhook Payload Tester",
  description: "Compose webhook payloads, inspect their fields, sign them like Stripe or GitHub, and get a curl command to test with.",
  keywords: [
    "webhook",
    "webhook tester",
    "webhook payload",
    "sample webhook payload",
    "webhook signature",
    "verify webhook signature",
    "hmac signature",
    "hmac sha256",
    "stripe webhook signature",
    "stripe-signature",
    "github webhook signature",
    "x-hub-signature-256",
    "slack signing secret",
    "shopify webhook hmac",
    "standard webhooks",
    "svix",
    "test webhook locally",
    "send test webhook",
  ],
  actions: ["generate", "inspect"],
  component: () => import("@/components/tools/developer/WebhookPayloadTester"),
  consumes: ["json"],
  produces: ["json"],
};

export default webhookPayloadTester;

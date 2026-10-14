/**
 * Sample payloads shaped like common providers' webhooks, for testing a
 * receiver. They follow each provider's public docs but are trimmed and use
 * made-up ids: real events carry more fields, and shapes change over time.
 */

import type { Scheme } from "./signature";

export interface WebhookTemplate {
  id: string;
  label: string;
  scheme: Scheme;
  /** Headers the provider sends besides the signature, e.g. the event name. */
  headers: [string, string][];
  payload: unknown;
}

export const TEMPLATES: WebhookTemplate[] = [
  {
    id: "stripe-payment-intent",
    label: "Stripe: payment_intent.succeeded",
    scheme: "stripe",
    headers: [],
    payload: {
      id: "evt_3Q0sample000000001",
      object: "event",
      api_version: "2024-06-20",
      created: 1767268800,
      type: "payment_intent.succeeded",
      livemode: false,
      pending_webhooks: 1,
      request: { id: "req_sample0001", idempotency_key: "2c2f0a5e-1f7b-4c1e-9d5e-0d6b7a1c9e10" },
      data: {
        object: {
          id: "pi_3Q0sample000000001",
          object: "payment_intent",
          amount: 4900,
          amount_received: 4900,
          currency: "usd",
          customer: "cus_Sample0001",
          payment_method: "pm_Sample0001",
          status: "succeeded",
          created: 1767268790,
          description: "Order #1001",
          receipt_email: "jane@example.com",
          metadata: { order_id: "1001" },
        },
      },
    },
  },
  {
    id: "github-push",
    label: "GitHub: push",
    scheme: "github",
    headers: [
      ["X-GitHub-Event", "push"],
      ["X-GitHub-Delivery", "72d3162e-cc78-11e3-81ab-4c9367dc0958"],
      ["User-Agent", "GitHub-Hookshot/sample"],
    ],
    payload: {
      ref: "refs/heads/main",
      before: "6113728f27ae82c7b1a177c8d03f9e96e0adf246",
      after: "0d1a26e67d8f5eaf1f6ba5c57fc3c7d91ac0fd1c",
      created: false,
      deleted: false,
      forced: false,
      compare: "https://github.com/octo-org/sample-repo/compare/6113728f27ae...0d1a26e67d8f",
      repository: {
        id: 123456789,
        name: "sample-repo",
        full_name: "octo-org/sample-repo",
        private: false,
        html_url: "https://github.com/octo-org/sample-repo",
        default_branch: "main",
      },
      pusher: { name: "octocat", email: "octocat@example.com" },
      sender: { login: "octocat", id: 583231, type: "User" },
      commits: [
        {
          id: "0d1a26e67d8f5eaf1f6ba5c57fc3c7d91ac0fd1c",
          message: "Fix webhook retries",
          timestamp: "2026-01-01T12:00:00Z",
          url: "https://github.com/octo-org/sample-repo/commit/0d1a26e67d8f5eaf1f6ba5c57fc3c7d91ac0fd1c",
          author: { name: "The Octocat", email: "octocat@example.com", username: "octocat" },
          added: [],
          removed: [],
          modified: ["src/webhooks.ts"],
        },
      ],
    },
  },
  {
    id: "shopify-order",
    label: "Shopify: orders/create",
    scheme: "shopify",
    headers: [
      ["X-Shopify-Topic", "orders/create"],
      ["X-Shopify-Shop-Domain", "sample-shop.myshopify.com"],
      ["X-Shopify-Webhook-Id", "b54557e4-bdd9-4b37-8a5f-bf7d70bcd043"],
    ],
    payload: {
      id: 820982911946154500,
      admin_graphql_api_id: "gid://shopify/Order/820982911946154508",
      email: "jane@example.com",
      created_at: "2026-01-01T12:00:00-05:00",
      currency: "USD",
      financial_status: "paid",
      total_price: "49.00",
      subtotal_price: "44.00",
      total_tax: "5.00",
      customer: { id: 115310627314723950, email: "jane@example.com", first_name: "Jane", last_name: "Doe" },
      line_items: [{ id: 866550311766439000, title: "Sample T-shirt", quantity: 2, price: "22.00", sku: "TSHIRT-M" }],
      shipping_address: { city: "Ottawa", country_code: "CA", zip: "K2P 1L4" },
    },
  },
  {
    id: "slack-event",
    label: "Slack: app_mention event",
    scheme: "slack",
    headers: [],
    payload: {
      token: "sample-verification-token",
      team_id: "T0SAMPLE1",
      api_app_id: "A0SAMPLE1",
      type: "event_callback",
      event_id: "Ev0SAMPLE01",
      event_time: 1767268800,
      event: {
        type: "app_mention",
        user: "U0SAMPLE1",
        text: "<@U0BOT0001> deploy the release",
        ts: "1767268800.000100",
        channel: "C0SAMPLE1",
        event_ts: "1767268800.000100",
      },
    },
  },
  {
    id: "standard-user-created",
    label: "Standard Webhooks: user.created",
    scheme: "standard",
    headers: [],
    payload: {
      type: "user.created",
      timestamp: "2026-01-01T12:00:00.000Z",
      data: { id: "user_2Sample0001", email: "jane@example.com", name: "Jane Doe", plan: "pro" },
    },
  },
  {
    id: "generic",
    label: "Generic event",
    scheme: "custom",
    headers: [["X-Event-Type", "order.paid"]],
    payload: {
      id: "evt_0001",
      type: "order.paid",
      created_at: "2026-01-01T12:00:00Z",
      data: { order_id: "1001", amount: 49.0, currency: "USD", customer: { id: "cus_0001", email: "jane@example.com" } },
    },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

export const templateText = (t: WebhookTemplate) => JSON.stringify(t.payload, null, 2);

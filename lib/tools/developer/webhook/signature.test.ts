import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CUSTOM, sign, verify, type CustomScheme, type SignOptions } from "./signature";

const base: SignOptions = { scheme: "github", secret: "It's a Secret to Everybody", body: "Hello, World!", timestamp: 1700000000, messageId: "msg_1" };
const header = async (o: Partial<SignOptions>) => {
  const r = await sign({ ...base, ...o });
  if (!r.ok) throw new Error(r.error);
  return Object.fromEntries(r.headers);
};
const nodeHmac = (secret: string, content: string, enc: "hex" | "base64" = "hex", alg = "sha256") => createHmac(alg, secret).update(content).digest(enc);

describe("sign", () => {
  it("matches GitHub's documented example", async () => {
    expect(await header({})).toEqual({ "X-Hub-Signature-256": "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17" });
  });

  it("matches the Standard Webhooks test vector", async () => {
    const h = await header({
      scheme: "standard",
      secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      messageId: "msg_p5jXN8AQM9LWM0D4loKWxJek",
      timestamp: 1614265330,
      body: '{"test": 2432232314}',
    });
    expect(h["webhook-signature"]).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
    expect(h["webhook-id"]).toBe("msg_p5jXN8AQM9LWM0D4loKWxJek");
  });

  it("signs Stripe, Slack and Shopify payloads the way they do", async () => {
    const body = '{"id":"evt_1"}';
    expect((await header({ scheme: "stripe", secret: "whsec_abc", body }))["Stripe-Signature"]).toBe(`t=1700000000,v1=${nodeHmac("whsec_abc", `1700000000.${body}`)}`);
    expect(await header({ scheme: "slack", secret: "s3cr3t", body })).toEqual({
      "X-Slack-Request-Timestamp": "1700000000",
      "X-Slack-Signature": `v0=${nodeHmac("s3cr3t", `v0:1700000000:${body}`)}`,
    });
    expect((await header({ scheme: "shopify", secret: "s3cr3t", body }))["X-Shopify-Hmac-Sha256"]).toBe(nodeHmac("s3cr3t", body, "base64"));
  });

  it("signs custom schemes: template, prefix, algorithm, encoding and headers", async () => {
    const custom = (c: Partial<CustomScheme>) => ({ scheme: "custom" as const, custom: { ...DEFAULT_CUSTOM, ...c } });
    expect(await header({ ...custom({}), secret: "k", body: "b" })).toEqual({ "X-Signature": `sha256=${nodeHmac("k", "b")}` });
    expect(await header({ ...custom({ algorithm: "SHA-512", encoding: "base64", prefix: "", header: "X-My-Sig" }), secret: "k", body: "b" })).toEqual({
      "X-My-Sig": nodeHmac("k", "b", "base64", "sha512"),
    });
    expect(await header({ ...custom({ template: "{id}:{timestamp}:{body}", prefix: "v1=" }), secret: "k", body: "{timestamp}", messageId: "m1" })).toEqual({
      "X-Timestamp": "1700000000",
      "X-Webhook-Id": "m1",
      "X-Signature": `v1=${nodeHmac("k", "m1:1700000000:{timestamp}")}`,
    });
  });

  it("decodes base64 and hex keys for custom schemes", async () => {
    const key = Buffer.from("raw key bytes");
    const expected = createHmac("sha256", key).update("b").digest("hex");
    const custom = (keyFormat: CustomScheme["keyFormat"]) => ({ scheme: "custom" as const, custom: { ...DEFAULT_CUSTOM, keyFormat, prefix: "" }, body: "b" });
    expect((await header({ ...custom("base64"), secret: key.toString("base64") }))["X-Signature"]).toBe(expected);
    expect((await header({ ...custom("hex"), secret: key.toString("hex") }))["X-Signature"]).toBe(expected);
    expect(await sign({ ...base, ...custom("hex"), secret: "xyz" })).toMatchObject({ ok: false, error: "The secret isn't valid hex." });
  });

  it("checks custom settings make a verifiable signature", async () => {
    const c = (custom: Partial<CustomScheme>) => sign({ ...base, scheme: "custom", custom: { ...DEFAULT_CUSTOM, ...custom } });
    expect(await c({ template: "{timestamp}" })).toMatchObject({ ok: false, error: expect.stringContaining("{body}") });
    expect(await c({ template: "{timestamp}.{body}", timestampHeader: " " })).toMatchObject({ ok: false, error: expect.stringContaining("timestamp") });
    expect(await c({ header: "" })).toMatchObject({ ok: false });
  });

  it("adds nothing without a signature, and needs no secret", async () => {
    expect(await sign({ ...base, scheme: "none", secret: "" })).toEqual({ ok: true, headers: [], signedContent: "" });
  });

  it("explains missing or malformed secrets", async () => {
    expect(await sign({ ...base, secret: "" })).toMatchObject({ ok: false });
    expect(await sign({ ...base, scheme: "standard", secret: "whsec_!!!" })).toMatchObject({ ok: false, error: expect.stringContaining("base64") });
  });
});

describe("verify", () => {
  const now = 1700000060;
  const base = { scheme: "github" as const, secret: "It's a Secret to Everybody", body: "Hello, World!" };

  it("accepts a matching signature in any hex case", async () => {
    const r = await verify({ ...base, signature: "sha256=757107EA0EB2509FC211221CCE984B8A37570B6D7586C22C46F4379C8B043E17", now });
    expect(r).toMatchObject({ ok: true, valid: true });
  });

  it("rejects a changed body, and says why it might differ", async () => {
    const r = await verify({ ...base, body: "Hello, World!\n", signature: "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17", now });
    expect(r).toMatchObject({ ok: true, valid: false, note: expect.stringContaining("byte-for-byte") });
  });

  it("reads Stripe's header with several v1 signatures and checks its age", async () => {
    const body = "{}";
    const good = nodeHmac("whsec_abc", `1700000000.${body}`);
    const r = await verify({ ...base, scheme: "stripe", secret: "whsec_abc", body, signature: `t=1700000000,v1=deadbeef,v1=${good}`, now });
    expect(r).toMatchObject({ ok: true, valid: true, ageSeconds: 60, note: undefined });
    const old = await verify({ ...base, scheme: "stripe", secret: "whsec_abc", body, signature: `t=1700000000,v1=${good}`, now: now + 3600 });
    expect(old).toMatchObject({ ok: true, valid: true, note: expect.stringContaining("61 minutes ago") });
    expect(await verify({ ...base, scheme: "stripe", signature: "v1=abc", now })).toMatchObject({ ok: false });
  });

  it("needs the timestamp header for Slack", async () => {
    expect(await verify({ ...base, scheme: "slack", signature: "v0=abc", now })).toMatchObject({ ok: false, error: expect.stringContaining("timestamp") });
    const body = "{}";
    const sig = `v0=${nodeHmac("s", `v0:1700000000:${body}`)}`;
    expect(await verify({ ...base, scheme: "slack", secret: "s", body, signature: sig, timestamp: "1700000000", now })).toMatchObject({ valid: true });
  });

  it("verifies custom signatures with a prefix and timestamp, and checks age", async () => {
    const custom = { ...DEFAULT_CUSTOM, template: "{timestamp}.{body}", prefix: "v1=" };
    const sig = `v1=${nodeHmac("k", "1700000000.{}").toUpperCase()}`;
    const r = await verify({ scheme: "custom", custom, secret: "k", body: "{}", signature: sig, timestamp: "1700000000", now });
    expect(r).toMatchObject({ ok: true, valid: true, ageSeconds: 60 });
    expect(await verify({ scheme: "custom", custom, secret: "k", body: "{}", signature: sig, now })).toMatchObject({ ok: false });
    expect(await verify({ scheme: "none", secret: "", body: "{}", signature: "x", now })).toMatchObject({ ok: false });
  });

  it("verifies Standard Webhooks signatures among several", async () => {
    const r = await verify({
      ...base,
      scheme: "standard",
      secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      messageId: "msg_p5jXN8AQM9LWM0D4loKWxJek",
      timestamp: "1614265330",
      body: '{"test": 2432232314}',
      signature: "v1,bm9wZQ== v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
      now: 1614265330,
    });
    expect(r).toMatchObject({ ok: true, valid: true });
  });
});

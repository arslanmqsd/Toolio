/**
 * Webhook signatures as providers compute them, with WebCrypto HMAC. Each
 * scheme signs the raw request body (sometimes with a timestamp or id in
 * front), so the receiver must check the bytes exactly as they arrived.
 */

export type Scheme = "github" | "stripe" | "slack" | "shopify" | "standard" | "custom" | "none";
export type Algorithm = "SHA-256" | "SHA-1" | "SHA-512";
export type Encoding = "hex" | "base64";
export type KeyFormat = "text" | "base64" | "hex";

/** A webhook signed your own way: what's signed, how the result is written, and where it goes. */
export interface CustomScheme {
  /** What's signed, with {body}, {timestamp} and {id} filled in. */
  template: string;
  algorithm: Algorithm;
  encoding: Encoding;
  /** Written before the signature, like "sha256=". */
  prefix: string;
  header: string;
  /** Headers that carry {timestamp} and {id}, when the template uses them. */
  timestampHeader: string;
  idHeader: string;
  /** How the secret becomes the HMAC key. */
  keyFormat: KeyFormat;
}

export const DEFAULT_CUSTOM: CustomScheme = {
  template: "{body}",
  algorithm: "SHA-256",
  encoding: "hex",
  prefix: "sha256=",
  header: "X-Signature",
  timestampHeader: "X-Timestamp",
  idHeader: "X-Webhook-Id",
  keyFormat: "text",
};

export const usesTimestamp = (scheme: Scheme, custom?: CustomScheme) =>
  scheme === "custom" ? Boolean(custom?.template.includes("{timestamp}")) : schemeInfo(scheme).timestamped;
export const usesId = (scheme: Scheme, custom?: CustomScheme) => (scheme === "custom" ? Boolean(custom?.template.includes("{id}")) : scheme === "standard");

export interface SchemeInfo {
  id: Scheme;
  label: string;
  /** The header carrying the signature. */
  header: string;
  /** What's signed, for the explanation. */
  signs: string;
  /** Uses a Unix timestamp the receiver can check for replays. */
  timestamped: boolean;
  secretHelp: string;
}

export const SCHEMES: SchemeInfo[] = [
  {
    id: "github",
    label: "GitHub",
    header: "X-Hub-Signature-256",
    signs: "the body",
    timestamped: false,
    secretHelp: "The secret set on the webhook in GitHub.",
  },
  {
    id: "stripe",
    label: "Stripe",
    header: "Stripe-Signature",
    signs: "timestamp + \".\" + body",
    timestamped: true,
    secretHelp: "The endpoint's signing secret, starting whsec_. It's used whole, prefix included.",
  },
  {
    id: "slack",
    label: "Slack",
    header: "X-Slack-Signature",
    signs: "\"v0:\" + timestamp + \":\" + body",
    timestamped: true,
    secretHelp: "The app's Signing Secret, from Basic Information.",
  },
  {
    id: "shopify",
    label: "Shopify",
    header: "X-Shopify-Hmac-Sha256",
    signs: "the body",
    timestamped: false,
    secretHelp: "The app's client secret, or the secret shown for webhooks made in the admin.",
  },
  {
    id: "standard",
    label: "Standard Webhooks (Svix, Resend, …)",
    header: "webhook-signature",
    signs: "id + \".\" + timestamp + \".\" + body",
    timestamped: true,
    secretHelp: "Starts whsec_; the rest is the base64 key.",
  },
  {
    id: "custom",
    label: "Custom HMAC",
    header: "X-Signature",
    signs: "the template",
    timestamped: false,
    secretHelp: "The secret your sender and receiver share.",
  },
  {
    id: "none",
    label: "No signature",
    header: "",
    signs: "nothing",
    timestamped: false,
    secretHelp: "Not needed: nothing is signed.",
  },
];

export const schemeInfo = (id: Scheme) => SCHEMES.find((s) => s.id === id)!;

export interface SignOptions {
  scheme: Scheme;
  secret: string;
  body: string;
  /** Unix seconds, for timestamped schemes. */
  timestamp: number;
  /** Message id, for Standard Webhooks and custom templates with {id}. */
  messageId: string;
  custom?: CustomScheme;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromHex(text: string): Uint8Array | null {
  const clean = text.replace(/\s/g, "");
  if (!clean || clean.length % 2 || /[^0-9a-f]/i.test(clean)) return null;
  return Uint8Array.from(clean.match(/../g)!, (h) => parseInt(h, 16));
}

function fromBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function hmac(key: Uint8Array, message: string, algorithm: Algorithm = "SHA-256"): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: algorithm }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, utf8(message) as BufferSource));
}

export type SignResult = { ok: true; headers: [string, string][]; signedContent: string } | { ok: false; error: string };

/** The headers a provider would send with `body`. */
export async function sign(o: SignOptions): Promise<SignResult> {
  if (o.scheme === "none") return { ok: true, headers: [], signedContent: "" };
  if (!o.secret) return { ok: false, error: "Enter the signing secret to compute the signature." };
  switch (o.scheme) {
    case "github": {
      const mac = toHex(await hmac(utf8(o.secret), o.body));
      return { ok: true, headers: [["X-Hub-Signature-256", `sha256=${mac}`]], signedContent: o.body };
    }
    case "stripe": {
      const content = `${o.timestamp}.${o.body}`;
      const mac = toHex(await hmac(utf8(o.secret), content));
      return { ok: true, headers: [["Stripe-Signature", `t=${o.timestamp},v1=${mac}`]], signedContent: content };
    }
    case "slack": {
      const content = `v0:${o.timestamp}:${o.body}`;
      const mac = toHex(await hmac(utf8(o.secret), content));
      return {
        ok: true,
        headers: [
          ["X-Slack-Request-Timestamp", String(o.timestamp)],
          ["X-Slack-Signature", `v0=${mac}`],
        ],
        signedContent: content,
      };
    }
    case "shopify": {
      const mac = toBase64(await hmac(utf8(o.secret), o.body));
      return { ok: true, headers: [["X-Shopify-Hmac-Sha256", mac]], signedContent: o.body };
    }
    case "standard": {
      const key = fromBase64(o.secret.replace(/^whsec_/, ""));
      if (!key || key.length === 0) return { ok: false, error: "Standard Webhooks secrets are whsec_ followed by base64, like whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw." };
      if (!o.messageId.trim()) return { ok: false, error: "Enter a message id; it's part of what's signed." };
      const content = `${o.messageId}.${o.timestamp}.${o.body}`;
      const mac = toBase64(await hmac(key, content));
      return {
        ok: true,
        headers: [
          ["webhook-id", o.messageId],
          ["webhook-timestamp", String(o.timestamp)],
          ["webhook-signature", `v1,${mac}`],
        ],
        signedContent: content,
      };
    }
    case "custom":
      return signCustom(o, o.custom ?? DEFAULT_CUSTOM);
  }
}

async function signCustom(o: SignOptions, c: CustomScheme): Promise<SignResult> {
  if (!c.template.includes("{body}")) return { ok: false, error: "Put {body} in what's signed, or the signature won't protect the payload." };
  if (!c.header.trim()) return { ok: false, error: "Name the header that carries the signature." };
  const withTimestamp = c.template.includes("{timestamp}");
  const withId = c.template.includes("{id}");
  if (withTimestamp && !c.timestampHeader.trim()) return { ok: false, error: "Name the header that carries the timestamp, so the receiver can rebuild what was signed." };
  if (withId && !c.idHeader.trim()) return { ok: false, error: "Name the header that carries the id, so the receiver can rebuild what was signed." };
  if (withId && !o.messageId.trim()) return { ok: false, error: "Enter an id; it's part of what's signed." };

  const key = c.keyFormat === "base64" ? fromBase64(o.secret.trim()) : c.keyFormat === "hex" ? fromHex(o.secret) : utf8(o.secret);
  if (!key || key.length === 0) return { ok: false, error: `The secret isn't valid ${c.keyFormat === "hex" ? "hex" : "base64"}.` };

  // One pass, so a body containing "{timestamp}" stays as it is.
  const values: Record<string, string> = { body: o.body, timestamp: String(o.timestamp), id: o.messageId };
  const content = c.template.replace(/\{(body|timestamp|id)\}/g, (_, name: string) => values[name]);
  const bytes = await hmac(key, content, c.algorithm);
  const headers: [string, string][] = [];
  if (withTimestamp) headers.push([c.timestampHeader.trim(), String(o.timestamp)]);
  if (withId) headers.push([c.idHeader.trim(), o.messageId]);
  headers.push([c.header.trim(), `${c.prefix}${c.encoding === "base64" ? toBase64(bytes) : toHex(bytes)}`]);
  return { ok: true, headers, signedContent: content };
}

export interface VerifyOptions extends Omit<SignOptions, "timestamp" | "messageId"> {
  /** The signature header's value as received. */
  signature: string;
  /** The timestamp header (Slack, Standard Webhooks, custom). Stripe carries its own in the signature header. */
  timestamp?: string;
  messageId?: string;
  /** Unix seconds now, for the age check. */
  now: number;
}

export type VerifyResult =
  | { ok: true; valid: boolean; expected: string; ageSeconds?: number; note?: string }
  | { ok: false; error: string };

/** Five minutes: the default tolerance in Stripe's, Slack's and Standard Webhooks' libraries. */
export const TOLERANCE_SECONDS = 300;

/** Checks a received signature against the body and secret. */
export async function verify(o: VerifyOptions): Promise<VerifyResult> {
  const signature = o.signature.trim();
  if (o.scheme === "none") return { ok: false, error: "With no signature there's nothing to verify." };
  if (!signature) return { ok: false, error: "Paste the signature header's value." };
  if (!o.secret) return { ok: false, error: "Enter the signing secret." };

  let timestamp = o.timestamp?.trim() ? Number(o.timestamp) : NaN;
  let candidates: string[];
  if (o.scheme === "stripe") {
    const parts = signature.split(",").map((p) => p.trim().split("="));
    const t = parts.find(([k]) => k === "t")?.[1];
    candidates = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
    if (!t || !candidates.length) return { ok: false, error: "A Stripe-Signature looks like t=1700000000,v1=5257a8…; this one is missing t or v1." };
    timestamp = Number(t);
  } else if (o.scheme === "standard") {
    candidates = signature.split(" ").filter((s) => s.startsWith("v1,")).map((s) => s.slice(3));
    if (!candidates.length) return { ok: false, error: "A webhook-signature looks like v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=." };
  } else if (o.scheme === "custom") {
    const prefix = (o.custom ?? DEFAULT_CUSTOM).prefix;
    candidates = [prefix && signature.toLowerCase().startsWith(prefix.toLowerCase()) ? signature.slice(prefix.length) : signature];
  } else {
    candidates = [signature.replace(/^(sha256=|v0=)/, "")];
  }

  const timed = usesTimestamp(o.scheme, o.custom);
  if (timed && !Number.isInteger(timestamp)) {
    return { ok: false, error: "Enter the request's timestamp header; it's part of what's signed." };
  }
  const signed = await sign({ ...o, timestamp, messageId: o.messageId ?? "" });
  if (signed.ok && !signed.headers.length) return { ok: false, error: "Nothing to verify." };
  if (!signed.ok) return signed;
  // The signature is always the last header sign() returns.
  const header = signed.headers[signed.headers.length - 1][1];
  const expected =
    o.scheme === "stripe"
      ? header.split("v1=")[1]
      : o.scheme === "standard"
        ? header.slice(3)
        : o.scheme === "custom"
          ? header.slice((o.custom ?? DEFAULT_CUSTOM).prefix.length)
          : header.replace(/^(sha256=|v0=)/, "");

  // Hex is case-insensitive; base64 isn't.
  const hex = o.scheme === "custom" ? (o.custom ?? DEFAULT_CUSTOM).encoding === "hex" : o.scheme !== "shopify" && o.scheme !== "standard";
  const valid = candidates.some((a) => (hex ? a.toLowerCase() === expected.toLowerCase() : a === expected));
  const ageSeconds = timed ? o.now - timestamp : undefined;
  let note: string | undefined;
  if (!valid) {
    note =
      "Check the secret, and that the body is byte-for-byte what was sent: re-indenting the JSON, changing line endings or a trailing newline changes the signature.";
  } else if (ageSeconds !== undefined && Math.abs(ageSeconds) > TOLERANCE_SECONDS) {
    note = `The signature matches, but it's ${ageSeconds > 0 ? "from" : "dated"} ${Math.round(Math.abs(ageSeconds) / 60)} minutes ${ageSeconds > 0 ? "ago" : "in the future"}. Libraries reject anything more than 5 minutes off by default, to stop replays.`;
  }
  return { ok: true, valid, expected, ageSeconds, note };
}

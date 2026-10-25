/**
 * Signing and verifying JWTs (JWS compact form) with WebCrypto, for the
 * algorithms in RFC 7518 and EdDSA from RFC 8037. ECDSA signatures from
 * WebCrypto are already r || s, the form JWS uses, so no DER conversion.
 */

import { base64ToBytes, bytesToBase64 } from "@/lib/encoding/base64";
import { keyBytes, type KeyFormat } from "@/lib/encoding/key-bytes";
import { decodeJwt } from "./jwt";
import { cleanJwk, describeKeyType, isPrivateJwk, parseKey, toPem, type KeyType, type ParsedKey } from "./jwt-keys";

export type JwtAlgorithm = "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512" | "PS256" | "PS384" | "PS512" | "ES256" | "ES384" | "ES512" | "EdDSA";
type Family = "hmac" | "rsa" | "rsa-pss" | "ecdsa" | "eddsa";
type Hash = "SHA-256" | "SHA-384" | "SHA-512";

export interface AlgorithmInfo {
  id: JwtAlgorithm;
  family: Family;
  hash: Hash;
  /** ECDSA and EdDSA curve. */
  curve?: string;
  label: string;
}

const hashBytes = (hash: Hash) => Number(hash.slice(4)) / 8;

export const ALGORITHMS: AlgorithmInfo[] = [
  { id: "HS256", family: "hmac", hash: "SHA-256", label: "HS256 · HMAC SHA-256" },
  { id: "HS384", family: "hmac", hash: "SHA-384", label: "HS384 · HMAC SHA-384" },
  { id: "HS512", family: "hmac", hash: "SHA-512", label: "HS512 · HMAC SHA-512" },
  { id: "RS256", family: "rsa", hash: "SHA-256", label: "RS256 · RSA SHA-256" },
  { id: "RS384", family: "rsa", hash: "SHA-384", label: "RS384 · RSA SHA-384" },
  { id: "RS512", family: "rsa", hash: "SHA-512", label: "RS512 · RSA SHA-512" },
  { id: "PS256", family: "rsa-pss", hash: "SHA-256", label: "PS256 · RSA-PSS SHA-256" },
  { id: "PS384", family: "rsa-pss", hash: "SHA-384", label: "PS384 · RSA-PSS SHA-384" },
  { id: "PS512", family: "rsa-pss", hash: "SHA-512", label: "PS512 · RSA-PSS SHA-512" },
  { id: "ES256", family: "ecdsa", hash: "SHA-256", curve: "P-256", label: "ES256 · ECDSA P-256" },
  { id: "ES384", family: "ecdsa", hash: "SHA-384", curve: "P-384", label: "ES384 · ECDSA P-384" },
  { id: "ES512", family: "ecdsa", hash: "SHA-512", curve: "P-521", label: "ES512 · ECDSA P-521" },
  { id: "EdDSA", family: "eddsa", hash: "SHA-512", curve: "Ed25519", label: "EdDSA · Ed25519" },
];

export const isAlgorithm = (value: unknown): value is JwtAlgorithm => ALGORITHMS.some((a) => a.id === value);
export const algorithmInfo = (id: JwtAlgorithm) => ALGORITHMS.find((a) => a.id === id)!;
export const usesSecret = (id: JwtAlgorithm) => algorithmInfo(id).family === "hmac";

/** The key an algorithm needs, for messages. */
export function keyNeeded(info: AlgorithmInfo): string {
  if (info.family === "hmac") return "a shared secret";
  if (info.family === "rsa" || info.family === "rsa-pss") return "an RSA key";
  if (info.family === "ecdsa") return `an EC ${info.curve} key`;
  return "an Ed25519 key";
}

function importParams(info: AlgorithmInfo): HmacImportParams | RsaHashedImportParams | EcKeyImportParams | Algorithm {
  switch (info.family) {
    case "hmac":
      return { name: "HMAC", hash: info.hash };
    case "rsa":
      return { name: "RSASSA-PKCS1-v1_5", hash: info.hash };
    case "rsa-pss":
      return { name: "RSA-PSS", hash: info.hash };
    case "ecdsa":
      return { name: "ECDSA", namedCurve: info.curve! };
    case "eddsa":
      return { name: "Ed25519" };
  }
}

function signParams(info: AlgorithmInfo): AlgorithmIdentifier | RsaPssParams | EcdsaParams {
  switch (info.family) {
    case "hmac":
      return "HMAC";
    case "rsa":
      return "RSASSA-PKCS1-v1_5";
    case "rsa-pss":
      // RFC 7518 §3.5: the salt is as long as the hash.
      return { name: "RSA-PSS", saltLength: hashBytes(info.hash) };
    case "ecdsa":
      return { name: "ECDSA", hash: info.hash };
    case "eddsa":
      return "Ed25519";
  }
}

/** Why a key can't be used with `info`, or null when its type fits. */
function mismatch(type: KeyType | null, info: AlgorithmInfo): string | null {
  if (!type) return null;
  const fits =
    info.family === "rsa" || info.family === "rsa-pss"
      ? type.kty === "RSA"
      : info.family === "ecdsa"
        ? type.kty === "EC" && type.curve === info.curve
        : type.kty === "OKP" && type.curve === "Ed25519";
  if (fits) return null;
  return `This is ${describeKeyType(type)}; ${info.id} needs ${keyNeeded(info)}.${suggestion(type)}`;
}

/** The algorithm that suits a key, for "use X instead" hints. */
export function algorithmForKey(type: KeyType | null): JwtAlgorithm | null {
  if (!type) return null;
  if (type.kty === "RSA") return "RS256";
  if (type.kty === "EC") return ALGORITHMS.find((a) => a.family === "ecdsa" && a.curve === type.curve)?.id ?? null;
  return type.curve === "Ed25519" ? "EdDSA" : null;
}

function suggestion(type: KeyType): string {
  const alg = algorithmForKey(type);
  return alg ? ` Choose ${type.kty === "RSA" ? "RS256, PS256 or another RSA algorithm" : alg}.` : "";
}

/** Turns WebCrypto's terse errors into something to act on. */
function cryptoError(err: unknown, info: AlgorithmInfo, action: string): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotSupportedError" || (info.family === "eddsa" && name !== "DataError")) {
    return `This browser can’t ${action} with ${info.id}. Ed25519 and P-521 need a recent Chrome, Edge, Firefox or Safari.`;
  }
  return `This key couldn’t be used for ${info.id}: it may be damaged or for a different algorithm.`;
}

const PSS_KEY =
  "This RSA key is marked for PSS only (OID rsassaPss), which browsers can’t import. Export it as a plain RSA key; PS256, PS384 and PS512 work with those.";

async function importKey(parsed: ParsedKey, info: AlgorithmInfo, usage: "sign" | "verify"): Promise<CryptoKey> {
  const params = importParams(info);
  if (parsed.format === "jwk") return crypto.subtle.importKey("jwk", cleanJwk(parsed.jwk, usage === "verify"), params, true, [usage]);
  return crypto.subtle.importKey(parsed.format, parsed.der, params, true, [usage]);
}

/** The public key of a private one, as PEM and JWK. */
async function publicOf(privateKey: CryptoKey, info: AlgorithmInfo): Promise<{ pem: string; jwk: JsonWebKey }> {
  const jwk = cleanJwk(await crypto.subtle.exportKey("jwk", privateKey), true);
  const key = await crypto.subtle.importKey("jwk", jwk, importParams(info), true, ["verify"]);
  return { pem: toPem("PUBLIC KEY", new Uint8Array(await crypto.subtle.exportKey("spki", key))), jwk };
}

const base64url = (bytes: Uint8Array) => bytesToBase64(bytes, { urlSafe: true, padding: false });
const ascii = (text: string) => new TextEncoder().encode(text);

export const encodeSegment = (value: unknown) => base64url(ascii(JSON.stringify(value)));

/** RFC 7518 §3.2: an HMAC key must be at least as long as the hash. */
export const minSecretBytes = (id: JwtAlgorithm) => hashBytes(algorithmInfo(id).hash);

export interface SignInput {
  alg: JwtAlgorithm;
  /** Header fields besides alg, like typ and kid. */
  header: Record<string, unknown>;
  payload: unknown;
  /** HMAC secret and how to read it. */
  secret?: string;
  secretFormat?: KeyFormat;
  /** PEM or JWK private key, for the other algorithms. */
  privateKey?: string;
}

export interface Signed {
  ok: true;
  token: string;
  header: Record<string, unknown>;
  /** For RSA, EC and EdDSA: the public key a verifier needs. */
  publicKey?: { pem: string; jwk: JsonWebKey };
  /** Something worth knowing about the key, like an RSA key under 2048 bits. */
  warning?: string;
}

export type SignResult = Signed | { ok: false; error: string };

export async function signJwt(input: SignInput): Promise<SignResult> {
  const info = algorithmInfo(input.alg);
  const header = { alg: input.alg, ...input.header };
  const signingInput = `${encodeSegment(header)}.${encodeSegment(input.payload)}`;

  let key: CryptoKey;
  let warning: string | undefined;
  if (info.family === "hmac") {
    const format = input.secretFormat ?? "text";
    const bytes = keyBytes(input.secret ?? "", format);
    if (!bytes) return { ok: false, error: input.secret ? `The secret isn’t valid ${format === "hex" ? "hex" : "Base64"}.` : "Enter a secret to sign with." };
    if (bytes.length < minSecretBytes(input.alg)) {
      warning = `The secret is ${bytes.length} bytes; ${input.alg} keys should be at least ${minSecretBytes(input.alg)} (RFC 7518). Some libraries reject shorter ones.`;
    }
    key = await crypto.subtle.importKey("raw", bytes, importParams(info), false, ["sign"]);
  } else {
    if (!input.privateKey?.trim()) return { ok: false, error: `Paste a private key, or generate a key pair. ${input.alg} needs ${keyNeeded(info)}.` };
    const parsed = parseKey(input.privateKey);
    if (!parsed.ok) return parsed;
    if (parsed.key.format === "spki" || (parsed.key.format === "jwk" && !isPrivateJwk(parsed.key.jwk))) {
      return { ok: false, error: "This is a public key. Signing needs the private key; the public one is for verifying." };
    }
    const wrongType = mismatch(parsed.key.type, info);
    if (wrongType) return { ok: false, error: wrongType };
    const type = parsed.key.type;
    if (type?.kty === "RSA" && type.pss) return { ok: false, error: PSS_KEY };
    if (type?.kty === "RSA" && type.bits && type.bits < 2048) {
      warning = `This RSA key is ${type.bits} bits. RFC 7518 requires at least 2048, and most libraries reject smaller keys.`;
    }
    try {
      key = await importKey(parsed.key, info, "sign");
    } catch (err) {
      return { ok: false, error: cryptoError(err, info, "sign") };
    }
  }

  const signature = new Uint8Array(await crypto.subtle.sign(signParams(info), key, ascii(signingInput)));
  const publicKey = info.family === "hmac" ? undefined : await publicOf(key, info).catch(() => undefined);
  return { ok: true, token: `${signingInput}.${base64url(signature)}`, header, publicKey, warning };
}

export interface KeyPair {
  privatePem: string;
  publicPem: string;
  publicJwk: JsonWebKey;
}

export type KeyPairResult = { ok: true; pair: KeyPair } | { ok: false; error: string };

/** A fresh key pair for an asymmetric algorithm. RSA keys are 2048 bits. */
export async function generateKeyPair(alg: JwtAlgorithm): Promise<KeyPairResult> {
  const info = algorithmInfo(alg);
  if (info.family === "hmac") return { ok: false, error: `${alg} uses a shared secret, not a key pair.` };
  const params =
    info.family === "rsa" || info.family === "rsa-pss"
      ? { ...(importParams(info) as RsaHashedImportParams), modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }
      : importParams(info);
  try {
    const pair = (await crypto.subtle.generateKey(params, true, ["sign", "verify"])) as CryptoKeyPair;
    const privateDer = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const publicDer = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    return {
      ok: true,
      pair: {
        privatePem: toPem("PRIVATE KEY", privateDer),
        publicPem: toPem("PUBLIC KEY", publicDer),
        publicJwk: cleanJwk(await crypto.subtle.exportKey("jwk", pair.publicKey), true),
      },
    };
  } catch (err) {
    return { ok: false, error: cryptoError(err, info, "make keys") };
  }
}

/** A random HMAC secret as long as the hash, Base64URL encoded. */
export function randomSecret(alg: JwtAlgorithm): string {
  return base64url(crypto.getRandomValues(new Uint8Array(minSecretBytes(alg))));
}

export interface VerifyInput {
  token: string;
  secret?: string;
  secretFormat?: KeyFormat;
  /** PEM (public or private key, or certificate), JWK or JWK Set. */
  key?: string;
}

export type VerifyResult = { ok: true; valid: boolean; alg: JwtAlgorithm; note?: string } | { ok: false; error: string };

export async function verifyJwt(input: VerifyInput): Promise<VerifyResult> {
  const decoded = decodeJwt(input.token);
  if (!decoded.ok) return decoded;
  const header = decoded.jwt.header as { alg?: unknown; kid?: unknown } | null;
  const alg = header && typeof header === "object" ? header.alg : undefined;
  if (alg === "none") return { ok: false, error: "This token says alg: none, so it has no signature. Never accept these." };
  if (!isAlgorithm(alg)) return { ok: false, error: `The header’s alg ${JSON.stringify(alg)} isn’t one this tool verifies.` };
  const info = algorithmInfo(alg);

  const trimmed = input.token.trim().replace(/^Bearer\s+/i, "");
  const [h, p, s] = trimmed.split(".");
  const sig = /^[A-Za-z0-9_-]*$/.test(s) ? base64ToBytes(s) : null;
  if (!sig?.ok || sig.bytes.length === 0) return { ok: false, error: "The signature segment isn’t valid Base64URL." };

  let key: CryptoKey;
  if (info.family === "hmac") {
    const format = input.secretFormat ?? "text";
    const bytes = keyBytes(input.secret ?? "", format);
    if (!bytes) return { ok: false, error: input.secret ? `The secret isn’t valid ${format === "hex" ? "hex" : "Base64"}.` : `Enter the secret: this token uses ${alg}.` };
    key = await crypto.subtle.importKey("raw", bytes, importParams(info), false, ["verify"]);
  } else {
    if (!input.key?.trim()) return { ok: false, error: `Paste the public key: this token uses ${alg}, which needs ${keyNeeded(info)}.` };
    const parsed = parseKey(input.key, typeof header?.kid === "string" ? header.kid : undefined);
    if (!parsed.ok) return parsed;
    const wrongType = mismatch(parsed.key.type, info);
    if (wrongType) return { ok: false, error: wrongType };
    if (parsed.key.type?.kty === "RSA" && parsed.key.type.pss) return { ok: false, error: PSS_KEY };
    try {
      if (parsed.key.format === "pkcs8") {
        // A private key holds its public half: verify with that.
        const privateKey = await importKey(parsed.key, info, "sign");
        const { jwk } = await publicOf(privateKey, info);
        key = await crypto.subtle.importKey("jwk", jwk, importParams(info), true, ["verify"]);
      } else {
        key = await importKey(parsed.key, info, "verify");
      }
    } catch (err) {
      return { ok: false, error: cryptoError(err, info, "verify") };
    }
  }

  const valid = await crypto.subtle.verify(signParams(info), key, sig.bytes, ascii(`${h}.${p}`));
  let note: string | undefined;
  if (!valid && info.family === "ecdsa") {
    const expected = 2 * Math.ceil(Number(info.curve!.slice(2)) / 8);
    if (sig.bytes.length !== expected) {
      note = `${alg} signatures are ${expected} bytes (r and s side by side); this one is ${sig.bytes.length}. It may be DER-encoded, which JWS doesn’t allow.`;
    }
  }
  return { ok: true, valid, alg, note };
}

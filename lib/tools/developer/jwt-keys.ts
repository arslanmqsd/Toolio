/**
 * Reading the keys people paste to sign or verify JWTs: PEM (PKCS#8, SPKI,
 * PKCS#1 RSA, SEC1 EC, X.509 certificates), JWK and JWK Sets. PKCS#1, SEC1 and
 * certificates are rewrapped as PKCS#8 or SPKI, the only DER forms WebCrypto
 * imports.
 */

import { base64ToBytes, bytesToBase64, wrapLines } from "@/lib/encoding/base64";

export type KeyType = { kty: "RSA"; bits?: number; pss?: boolean } | { kty: "EC"; curve: string } | { kty: "OKP"; curve: string };

export type ParsedKey =
  | { format: "pkcs8" | "spki"; der: Uint8Array<ArrayBuffer>; type: KeyType | null }
  | { format: "jwk"; jwk: JsonWebKey; type: KeyType | null };

export type ParseResult = { ok: true; key: ParsedKey } | { ok: false; error: string };

// --- DER ---------------------------------------------------------------------------------------

interface Tlv {
  tag: number;
  /** Where the tag byte is. */
  offset: number;
  /** Where the content starts and ends. */
  start: number;
  end: number;
}

function readTlv(bytes: Uint8Array, offset: number): Tlv {
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4) throw new Error("bad DER length");
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[start + i];
    start += count;
  }
  const end = start + length;
  if (tag === undefined || end > bytes.length) throw new Error("truncated DER");
  return { tag, offset, start, end };
}

/** The TLVs directly inside a constructed one. */
function children(bytes: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let at = parent.start; at < parent.end; ) {
    const tlv = readTlv(bytes, at);
    out.push(tlv);
    at = tlv.end;
  }
  return out;
}

function lengthBytes(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return [0x80 | out.length, ...out];
}

function der(tag: number, ...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const length = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array([tag, ...lengthBytes(length), ...new Uint8Array(length)]);
  let at = out.length - length;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const SEQUENCE = 0x30;
const INTEGER = 0x02;
const BIT_STRING = 0x03;
const OCTET_STRING = 0x04;
const NULL = new Uint8Array([0x05, 0x00]);

function oidBytes(oid: string): Uint8Array {
  const [a, b, ...rest] = oid.split(".").map(Number);
  const body = [a * 40 + b];
  for (const n of rest) {
    const chunk = [n & 0x7f];
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift((v & 0x7f) | 0x80);
    body.push(...chunk);
  }
  return der(0x06, new Uint8Array(body));
}

function readOid(bytes: Uint8Array, tlv: Tlv): string {
  const body = bytes.subarray(tlv.start, tlv.end);
  const parts = [Math.floor(body[0] / 40), body[0] % 40];
  let n = 0;
  for (let i = 1; i < body.length; i++) {
    n = n * 128 + (body[i] & 0x7f);
    if (!(body[i] & 0x80)) {
      parts.push(n);
      n = 0;
    }
  }
  return parts.join(".");
}

const OID = {
  rsa: "1.2.840.113549.1.1.1",
  rsaPss: "1.2.840.113549.1.1.10",
  ec: "1.2.840.10045.2.1",
  ed25519: "1.3.101.112",
  ed448: "1.3.101.113",
};

const CURVES: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
  "1.3.132.0.10": "secp256k1",
};

/** RSA modulus size in bits, from the INTEGER holding it. */
function modulusBits(bytes: Uint8Array, tlv: Tlv): number {
  let start = tlv.start;
  while (start < tlv.end && bytes[start] === 0) start++;
  return start === tlv.end ? 0 : (tlv.end - start - 1) * 8 + Math.floor(Math.log2(bytes[start])) + 1;
}

/** The key type from an AlgorithmIdentifier, plus the RSA size when the key itself is at hand. */
function typeOf(bytes: Uint8Array, algorithmId: Tlv): KeyType | null {
  const [oid, params] = children(bytes, algorithmId);
  const id = readOid(bytes, oid);
  if (id === OID.rsa || id === OID.rsaPss) return { kty: "RSA", pss: id === OID.rsaPss };
  if (id === OID.ec) return { kty: "EC", curve: params?.tag === 0x06 ? (CURVES[readOid(bytes, params)] ?? "an unknown curve") : "an unknown curve" };
  if (id === OID.ed25519) return { kty: "OKP", curve: "Ed25519" };
  if (id === OID.ed448) return { kty: "OKP", curve: "Ed448" };
  return null;
}

function inspectSpki(bytes: Uint8Array): KeyType | null {
  const [algorithmId, bitString] = children(bytes, readTlv(bytes, 0));
  const type = typeOf(bytes, algorithmId);
  if (type?.kty === "RSA") {
    // BIT STRING: one byte of unused bits, then RSAPublicKey ::= SEQUENCE { modulus, exponent }.
    const [modulus] = children(bytes, readTlv(bytes, bitString.start + 1));
    type.bits = modulusBits(bytes, modulus);
  }
  return type;
}

function inspectPkcs8(bytes: Uint8Array): KeyType | null {
  const [, algorithmId, octets] = children(bytes, readTlv(bytes, 0));
  const type = typeOf(bytes, algorithmId);
  if (type?.kty === "RSA") {
    // RSAPrivateKey ::= SEQUENCE { version, modulus, … }
    const [, modulus] = children(bytes, readTlv(bytes, octets.start));
    type.bits = modulusBits(bytes, modulus);
  }
  return type;
}

/** PKCS#1 RSAPrivateKey → PKCS#8. */
function rsaPkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  return der(SEQUENCE, der(INTEGER, new Uint8Array([0])), der(SEQUENCE, oidBytes(OID.rsa), NULL), der(OCTET_STRING, pkcs1));
}

/** PKCS#1 RSAPublicKey → SPKI. */
function rsaPkcs1ToSpki(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  return der(SEQUENCE, der(SEQUENCE, oidBytes(OID.rsa), NULL), der(BIT_STRING, new Uint8Array([0]), pkcs1));
}

/** SEC1 ECPrivateKey → PKCS#8, taking the curve from its parameters. */
function sec1ToPkcs8(sec1: Uint8Array): { der: Uint8Array<ArrayBuffer>; curve: string } | null {
  const fields = children(sec1, readTlv(sec1, 0));
  const params = fields.find((f) => f.tag === 0xa0);
  const curveOid = params ? readOid(sec1, readTlv(sec1, params.start)) : null;
  const curve = curveOid ? CURVES[curveOid] : undefined;
  if (!curveOid || !curve) return null;
  return { der: der(SEQUENCE, der(INTEGER, new Uint8Array([0])), der(SEQUENCE, oidBytes(OID.ec), oidBytes(curveOid)), der(OCTET_STRING, sec1)), curve };
}

/** The SubjectPublicKeyInfo inside an X.509 certificate. */
function certificateSpki(cert: Uint8Array): Uint8Array<ArrayBuffer> {
  const [tbs] = children(cert, readTlv(cert, 0));
  const fields = children(cert, tbs);
  // tbsCertificate: [0] version (optional), serial, signature, issuer, validity, subject, subjectPublicKeyInfo, …
  const spki = fields[fields[0].tag === 0xa0 ? 6 : 5];
  return cert.slice(spki.offset, spki.end);
}

// --- PEM and JWK -------------------------------------------------------------------------------

const PEM = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/;

export function toPem(label: string, bytes: Uint8Array): string {
  return `-----BEGIN ${label}-----\n${wrapLines(bytesToBase64(bytes), 64)}\n-----END ${label}-----`;
}

function jwkType(jwk: JsonWebKey): KeyType | null {
  if (jwk.kty === "RSA") {
    const n = jwk.n ? base64ToBytes(jwk.n) : null;
    return { kty: "RSA", bits: n?.ok ? modulusBits(n.bytes, { tag: INTEGER, offset: 0, start: 0, end: n.bytes.length }) : undefined };
  }
  if (jwk.kty === "EC") return { kty: "EC", curve: jwk.crv ?? "an unknown curve" };
  if (jwk.kty === "OKP") return { kty: "OKP", curve: jwk.crv ?? "an unknown curve" };
  return null;
}

const PRIVATE_JWK_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "oth"] as const;

/** A JWK with only what WebCrypto needs, so stray alg/use/key_ops fields don't block the import. */
export function cleanJwk(jwk: JsonWebKey, publicOnly: boolean): JsonWebKey {
  const keep: (keyof JsonWebKey)[] = ["kty", "n", "e", "crv", "x", "y", ...(publicOnly ? [] : PRIVATE_JWK_FIELDS)];
  const out: JsonWebKey = {};
  for (const field of keep) if (jwk[field] !== undefined) (out as Record<string, unknown>)[field] = jwk[field];
  return out;
}

export const isPrivateJwk = (jwk: JsonWebKey) => typeof jwk.d === "string";

/**
 * Parses a pasted key. A JWK Set picks the key whose `kid` matches, or the only key, so the
 * caller passes the token's `kid` when verifying.
 */
export function parseKey(text: string, kid?: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Paste a key." };

  if (trimmed.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: "This starts like a JWK but isn’t valid JSON." };
    }
    let jwk = json as JsonWebKey & { kid?: string; keys?: (JsonWebKey & { kid?: string })[] };
    if (Array.isArray(jwk.keys)) {
      const keys = jwk.keys;
      const match = kid !== undefined ? keys.find((k) => k.kid === kid) : keys.length === 1 ? keys[0] : undefined;
      if (!match) {
        return {
          ok: false,
          error:
            kid !== undefined
              ? `No key in this JWK Set has kid "${kid}". Its kids: ${keys.map((k) => k.kid ?? "(none)").join(", ") || "none"}.`
              : `This JWK Set has ${keys.length} keys and the token has no kid to pick one. Paste just the key to use.`,
        };
      }
      jwk = match;
    }
    if (typeof jwk.kty !== "string") return { ok: false, error: "A JWK needs a kty field." };
    return { ok: true, key: { format: "jwk", jwk, type: jwkType(jwk) } };
  }

  const pem = PEM.exec(trimmed);
  if (!pem) return { ok: false, error: "Paste a PEM key (-----BEGIN … KEY-----) or a JWK." };
  const decoded = base64ToBytes(pem[2]);
  if (!decoded.ok) return { ok: false, error: `The PEM body isn’t valid Base64: ${decoded.error}` };
  const bytes = decoded.bytes;

  try {
    switch (pem[1]) {
      case "PRIVATE KEY":
        return { ok: true, key: { format: "pkcs8", der: bytes, type: inspectPkcs8(bytes) } };
      case "PUBLIC KEY":
        return { ok: true, key: { format: "spki", der: bytes, type: inspectSpki(bytes) } };
      case "RSA PRIVATE KEY": {
        const pkcs8 = rsaPkcs1ToPkcs8(bytes);
        return { ok: true, key: { format: "pkcs8", der: pkcs8, type: inspectPkcs8(pkcs8) } };
      }
      case "RSA PUBLIC KEY": {
        const spki = rsaPkcs1ToSpki(bytes);
        return { ok: true, key: { format: "spki", der: spki, type: inspectSpki(spki) } };
      }
      case "EC PRIVATE KEY": {
        const converted = sec1ToPkcs8(bytes);
        if (!converted) return { ok: false, error: "This EC key doesn’t name a supported curve (P-256, P-384 or P-521)." };
        return { ok: true, key: { format: "pkcs8", der: converted.der, type: { kty: "EC", curve: converted.curve } } };
      }
      case "CERTIFICATE": {
        const spki = certificateSpki(bytes);
        return { ok: true, key: { format: "spki", der: spki, type: inspectSpki(spki) } };
      }
      case "ENCRYPTED PRIVATE KEY":
        return { ok: false, error: "This key is encrypted with a passphrase. Decrypt it first: openssl pkcs8 -in key.pem -out plain.pem" };
      default:
        return { ok: false, error: `A PEM ${pem[1]} isn’t a key this tool reads. Use a PRIVATE KEY, PUBLIC KEY or CERTIFICATE.` };
    }
  } catch {
    return { ok: false, error: `The ${pem[1]} is damaged: its contents don’t parse. Check it was copied whole.` };
  }
}

export function describeKeyType(type: KeyType | null): string {
  if (!type) return "an unrecognised key";
  if (type.kty === "RSA") return `${type.pss ? "an RSA-PSS" : "an RSA"}${type.bits ? ` ${type.bits}-bit` : ""} key`;
  if (type.kty === "EC") return `an EC ${type.curve} key`;
  return `an ${type.curve} key`;
}

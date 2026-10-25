import { createPublicKey, createSign, generateKeyPairSync, sign as nodeSign, verify as nodeVerify, X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "@/lib/encoding/base64";
import { buildPayload, parseDuration } from "./jwt-claims";
import { parseKey } from "./jwt-keys";
import { generateKeyPair, randomSecret, signJwt, verifyJwt, type JwtAlgorithm } from "./jwt-sign";

const b64url = (b: Uint8Array) => bytesToBase64(b, { urlSafe: true, padding: false });
const fromB64url = (s: string) => Buffer.from(s, "base64url");
const payload = { sub: "1234567890", name: "Ada", iat: 1735689600 };

// jwt.io's sample, signed with "your-256-bit-secret".
const JWT_IO = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const nodeAlg: Record<string, { hash: string; pss?: boolean; p1363?: boolean }> = {
  RS256: { hash: "sha256" },
  RS512: { hash: "sha512" },
  PS256: { hash: "sha256", pss: true },
  PS384: { hash: "sha384", pss: true },
  ES256: { hash: "sha256", p1363: true },
  ES384: { hash: "sha384", p1363: true },
  ES512: { hash: "sha512", p1363: true },
};

function nodeKeys(alg: JwtAlgorithm) {
  if (alg.startsWith("ES")) {
    const namedCurve = { ES256: "P-256", ES384: "P-384", ES512: "P-521" }[alg as "ES256"];
    return generateKeyPairSync("ec", { namedCurve });
  }
  if (alg === "EdDSA") return generateKeyPairSync("ed25519");
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

function nodeVerifies(alg: JwtAlgorithm, token: string, publicKey: Parameters<typeof nodeVerify>[2]) {
  const [h, p, s] = token.split(".");
  const data = Buffer.from(`${h}.${p}`);
  if (alg === "EdDSA") return nodeVerify(null, data, publicKey, fromB64url(s));
  const o = nodeAlg[alg];
  const key = o.pss
    ? { key: publicKey as never, padding: 6, saltLength: Number(o.hash.slice(3)) / 8 }
    : o.p1363
      ? { key: publicKey as never, dsaEncoding: "ieee-p1363" as const }
      : publicKey;
  return nodeVerify(o.hash, data, key as never, fromB64url(s));
}

function nodeSignToken(alg: JwtAlgorithm, privateKey: Parameters<typeof nodeSign>[2]) {
  const head = b64url(Buffer.from(JSON.stringify({ alg, typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const data = Buffer.from(`${head}.${body}`);
  let sig: Buffer;
  if (alg === "EdDSA") sig = nodeSign(null, data, privateKey);
  else {
    const o = nodeAlg[alg];
    const key = o.pss ? { key: privateKey as never, padding: 6, saltLength: Number(o.hash.slice(3)) / 8 } : o.p1363 ? { key: privateKey as never, dsaEncoding: "ieee-p1363" as const } : privateKey;
    sig = nodeSign(o.hash, data, key as never);
  }
  return `${head}.${body}.${b64url(sig)}`;
}

describe("HMAC", () => {
  it("verifies jwt.io's sample token", async () => {
    expect(await verifyJwt({ token: JWT_IO, secret: "your-256-bit-secret" })).toMatchObject({ ok: true, valid: true, alg: "HS256" });
    expect(await verifyJwt({ token: JWT_IO, secret: "wrong" })).toMatchObject({ ok: true, valid: false });
  });

  it("reproduces jwt.io's signature", async () => {
    const r = await signJwt({ alg: "HS256", header: { typ: "JWT" }, payload: { sub: "1234567890", name: "John Doe", iat: 1516239022 }, secret: "your-256-bit-secret" });
    expect(r.ok && r.token).toBe(JWT_IO);
  });

  it("reads Base64 and hex secrets, and round-trips HS384/HS512", async () => {
    for (const alg of ["HS384", "HS512"] as const) {
      const secret = randomSecret(alg);
      const r = await signJwt({ alg, header: {}, payload, secret, secretFormat: "base64" });
      if (!r.ok) throw new Error(r.error);
      expect(r.warning).toBeUndefined();
      const hex = Buffer.from(secret, "base64url").toString("hex");
      expect(await verifyJwt({ token: r.token, secret: hex, secretFormat: "hex" })).toMatchObject({ valid: true });
    }
  });

  it("warns about short secrets and rejects bad encodings", async () => {
    const r = await signJwt({ alg: "HS256", header: {}, payload, secret: "short" });
    expect(r.ok && r.warning).toMatch(/5 bytes.*at least 32/);
    expect(await signJwt({ alg: "HS256", header: {}, payload, secret: "zz", secretFormat: "hex" })).toMatchObject({ ok: false });
    expect(await signJwt({ alg: "HS256", header: {}, payload, secret: "" })).toMatchObject({ ok: false });
  });
});

describe("asymmetric, against node:crypto", () => {
  const algs: JwtAlgorithm[] = ["RS256", "RS512", "PS256", "PS384", "ES256", "ES384", "ES512", "EdDSA"];

  it.each(algs)("%s: our tokens verify in Node, and Node's verify here", async (alg) => {
    const { privateKey, publicKey } = nodeKeys(alg);
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const publicPem = publicKey.export({ type: "spki", format: "pem" }) as string;

    const r = await signJwt({ alg, header: { typ: "JWT", kid: "k1" }, payload, privateKey: privatePem });
    if (!r.ok) throw new Error(r.error);
    expect(nodeVerifies(alg, r.token, publicKey)).toBe(true);
    expect(JSON.parse(fromB64url(r.token.split(".")[0]).toString())).toEqual({ alg, typ: "JWT", kid: "k1" });
    // The public key it reports is the right one.
    expect(createPublicKey(r.publicKey!.pem).export({ type: "spki", format: "pem" })).toBe(publicPem);

    const theirs = nodeSignToken(alg, privateKey);
    expect(await verifyJwt({ token: theirs, key: publicPem })).toMatchObject({ ok: true, valid: true, alg });
    expect(await verifyJwt({ token: theirs, key: JSON.stringify(publicKey.export({ format: "jwk" })) })).toMatchObject({ valid: true });
    // With the private key, it verifies using its public half.
    expect(await verifyJwt({ token: theirs, key: privatePem })).toMatchObject({ valid: true });

    const tampered = theirs.replace(/\.[^.]+\./, `.${b64url(Buffer.from(JSON.stringify({ ...payload, name: "Eve" })))}.`);
    expect(await verifyJwt({ token: tampered, key: publicPem })).toMatchObject({ ok: true, valid: false });
  });

  it("signs with JWK private keys", async () => {
    const { privateKey, publicKey } = nodeKeys("ES256");
    const jwk = { ...privateKey.export({ format: "jwk" }), alg: "ES256", use: "sig", kid: "x" };
    const r = await signJwt({ alg: "ES256", header: {}, payload, privateKey: JSON.stringify(jwk) });
    expect(r.ok && nodeVerifies("ES256", r.token, publicKey)).toBe(true);
  });

  it("reads PKCS#1 RSA and SEC1 EC keys", async () => {
    const rsa = nodeKeys("RS256");
    const pkcs1 = rsa.privateKey.export({ type: "pkcs1", format: "pem" }) as string;
    expect(pkcs1).toContain("BEGIN RSA PRIVATE KEY");
    const r = await signJwt({ alg: "RS256", header: {}, payload, privateKey: pkcs1 });
    expect(r.ok && nodeVerifies("RS256", r.token, rsa.publicKey)).toBe(true);
    const pkcs1Public = rsa.publicKey.export({ type: "pkcs1", format: "pem" }) as string;
    expect(await verifyJwt({ token: (r.ok && r.token) || "", key: pkcs1Public })).toMatchObject({ valid: true });

    const ec = nodeKeys("ES384");
    const sec1 = ec.privateKey.export({ type: "sec1", format: "pem" }) as string;
    expect(sec1).toContain("BEGIN EC PRIVATE KEY");
    const e = await signJwt({ alg: "ES384", header: {}, payload, privateKey: sec1 });
    expect(e.ok && nodeVerifies("ES384", e.token, ec.publicKey)).toBe(true);
  });

  it("reads key types and RSA sizes", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 3072 });
    const parsed = parseKey(rsa.publicKey.export({ type: "spki", format: "pem" }) as string);
    expect(parsed.ok && parsed.key.type).toEqual({ kty: "RSA", pss: false, bits: 3072 });
    const priv = parseKey(rsa.privateKey.export({ type: "pkcs8", format: "pem" }) as string);
    expect(priv.ok && priv.key.type).toMatchObject({ kty: "RSA", bits: 3072 });
    const ec = parseKey(nodeKeys("ES512").publicKey.export({ type: "spki", format: "pem" }) as string);
    expect(ec.ok && ec.key.type).toEqual({ kty: "EC", curve: "P-521" });
  });

  it("explains keys that don't fit the algorithm", async () => {
    const ec = nodeKeys("ES256").privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(await signJwt({ alg: "RS256", header: {}, payload, privateKey: ec })).toEqual({
      ok: false,
      error: "This is an EC P-256 key; RS256 needs an RSA key. Choose ES256.",
    });
    expect(await signJwt({ alg: "ES384", header: {}, payload, privateKey: ec })).toMatchObject({ error: expect.stringMatching(/needs an EC P-384 key/) });
    const pub = nodeKeys("ES256").publicKey.export({ type: "spki", format: "pem" }) as string;
    expect(await signJwt({ alg: "ES256", header: {}, payload, privateKey: pub })).toMatchObject({ error: expect.stringMatching(/public key/) });
    expect(await signJwt({ alg: "ES256", header: {}, payload, privateKey: "-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----" })).toMatchObject({
      error: expect.stringMatching(/encrypted/),
    });
  });

  it("warns about small RSA keys", async () => {
    const small = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const r = await signJwt({ alg: "RS256", header: {}, payload, privateKey: small });
    expect(r.ok && r.warning).toMatch(/1024 bits/);
  });
});

describe("verifying from certificates and JWK Sets", () => {
  // A throwaway self-signed P-256 certificate and its key, made for this test with
  // openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -subj /CN=localhost
  const CERT_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgHcSiT7To2AjcK5Yh
6R10oPxVjBEjGs7rHeuSyAsqKfGhRANCAAQWwkWdde96wpXzFWBVB3iF1JlrhJPt
zjdKyx5EA749CNh8Gjk6CQtwdE5FD91XcpX1VxcZr8x3vfF8dNP49y/j
-----END PRIVATE KEY-----`;
  const CERT = `-----BEGIN CERTIFICATE-----
MIIBfjCCASOgAwIBAgIUPrqyYvUpU5VFW4hBsK7l3hCddQMwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MTAxNTE3NDUxM1oXDTM2MTAxMjE3
NDUxM1owFDESMBAGA1UEAwwJbG9jYWxob3N0MFkwEwYHKoZIzj0CAQYIKoZIzj0D
AQcDQgAEFsJFnXXvesKV8xVgVQd4hdSZa4ST7c43SsseRAO+PQjYfBo5OgkLcHRO
RQ/dV3KV9VcXGa/Md73xfHTT+Pcv46NTMFEwHQYDVR0OBBYEFE3jWfof960xlBJl
xbFHsZW5M4WkMB8GA1UdIwQYMBaAFE3jWfof960xlBJlxbFHsZW5M4WkMA8GA1Ud
EwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhAI8KnqnO09I2gBCFRBiNTk2Q
RoRCHGG26pSWkBY5nSq9AiEAxNkVxSJoungunjCFTPMWnoO7MKqIYbG5OKOBTvsq
mwU=
-----END CERTIFICATE-----`;

  it("verifies with the certificate's key", async () => {
    const parsed = parseKey(CERT);
    expect(parsed.ok && parsed.key.type).toEqual({ kty: "EC", curve: "P-256" });
    const r = await signJwt({ alg: "ES256", header: {}, payload, privateKey: CERT_KEY });
    if (!r.ok) throw new Error(r.error);
    const certPublic = new X509Certificate(CERT).publicKey.export({ type: "spki", format: "pem" }) as string;
    expect(r.publicKey!.pem.replace(/\s/g, "")).toBe(certPublic.replace(/\s/g, ""));
    expect(await verifyJwt({ token: r.token, key: CERT })).toMatchObject({ valid: true });
  });

  it("picks the JWK Set key by kid", async () => {
    const a = nodeKeys("RS256");
    const b = nodeKeys("RS256");
    const set = JSON.stringify({ keys: [{ ...a.publicKey.export({ format: "jwk" }), kid: "a" }, { ...b.publicKey.export({ format: "jwk" }), kid: "b" }] });
    const pem = b.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const r = await signJwt({ alg: "RS256", header: { kid: "b" }, payload, privateKey: pem });
    expect(await verifyJwt({ token: (r.ok && r.token) || "", key: set })).toMatchObject({ valid: true });
    const other = await signJwt({ alg: "RS256", header: { kid: "c" }, payload, privateKey: pem });
    expect(await verifyJwt({ token: (other.ok && other.token) || "", key: set })).toMatchObject({ ok: false, error: expect.stringMatching(/kid "c".*a, b/) });
  });
});

describe("verify edge cases", () => {
  it("refuses alg none and unknown algorithms", async () => {
    const none = `${b64url(Buffer.from('{"alg":"none"}'))}.${b64url(Buffer.from("{}"))}.`;
    expect(await verifyJwt({ token: none, secret: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/alg: none/) });
    const weird = `${b64url(Buffer.from('{"alg":"HS1"}'))}.${b64url(Buffer.from("{}"))}.abc`;
    expect(await verifyJwt({ token: weird, secret: "x" })).toMatchObject({ ok: false });
  });

  it("points out DER-encoded ECDSA signatures", async () => {
    const { privateKey, publicKey } = nodeKeys("ES256");
    const head = b64url(Buffer.from('{"alg":"ES256"}'));
    const body = b64url(Buffer.from("{}"));
    const derSig = createSign("sha256").update(`${head}.${body}`).sign(privateKey);
    const r = await verifyJwt({ token: `${head}.${body}.${b64url(derSig)}`, key: publicKey.export({ type: "spki", format: "pem" }) as string });
    expect(r).toMatchObject({ ok: true, valid: false, note: expect.stringMatching(/DER/) });
  });
});

describe("generateKeyPair", () => {
  it.each(["RS256", "PS256", "ES256", "ES512", "EdDSA"] as JwtAlgorithm[])("%s keys sign and verify", async (alg) => {
    const g = await generateKeyPair(alg);
    if (!g.ok) throw new Error(g.error);
    const r = await signJwt({ alg, header: {}, payload, privateKey: g.pair.privatePem });
    if (!r.ok) throw new Error(r.error);
    expect(r.publicKey!.pem).toBe(g.pair.publicPem);
    expect(nodeVerifies(alg, r.token, createPublicKey(g.pair.publicPem))).toBe(true);
  });
});

describe("claims", () => {
  it("parses durations", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("15m")).toBe(900);
    expect(parseDuration("1h 30m")).toBe(5400);
    expect(parseDuration("7D")).toBe(604800);
    expect(parseDuration("1w2d")).toBe(777600);
    expect(parseDuration("1.5h")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("-5m")).toBeNull();
  });

  it("builds the payload in order, with custom claims winning", () => {
    const form = { iss: " https://auth.example.com ", sub: "user_1", aud: "api, web", jti: "", iat: true, exp: "1h", nbf: "0" };
    const r = buildPayload(form, { role: "admin", sub: "user_2" }, 1000);
    expect(r.payload).toEqual({ iss: "https://auth.example.com", sub: "user_2", aud: ["api", "web"], iat: 1000, nbf: 1000, exp: 4600, role: "admin" });
    expect(Object.keys(r.payload)).toEqual(["iss", "sub", "aud", "iat", "nbf", "exp", "role"]);
    expect(r.overridden).toEqual(["sub"]);
    expect(buildPayload({ ...form, aud: "api", exp: "later" }, {}, 0)).toMatchObject({ payload: { aud: "api" }, errors: { exp: expect.any(String) } });
  });
});

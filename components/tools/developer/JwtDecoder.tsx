"use client";

import { useEffect, useMemo, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import { CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import Section from "@/components/ui/Section";
import { useNow } from "@/lib/hooks/useNow";
import type { KeyFormat } from "@/lib/encoding/key-bytes";
import { decodeJwt, formatDuration, getExpiry, type ExpiryInfo } from "@/lib/tools/developer/jwt";
import { algorithmInfo, isAlgorithm, keyNeeded, verifyJwt, type VerifyResult } from "@/lib/tools/developer/jwt-sign";
import SecretInput from "./jwt/SecretInput";

// Real HS256 token signed with the secret "your-256-bit-secret"; expires 2031-01-01.
const EXAMPLE_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImVtYWlsIjoiYWRhQGV4YW1wbGUuY29tIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzM1Njg5NjAwLCJleHAiOjE5MjQ5OTIwMDB9.V-GZZDP_65htbNewPaxGMfEnN_UlGTjctwqp6kot9QY";

const EXPIRING_SOON_MS = 5 * 60 * 1000;

function ExpiryDetails({ expiry }: { expiry: ExpiryInfo }) {
  const now = useNow(expiry.kind === "valid");

  if (expiry.kind === "none") {
    return <p className="text-[color:var(--text-muted)]">No exp claim. This token does not expire.</p>;
  }
  if (expiry.kind === "invalid") {
    return (
      <p className="text-[color:var(--accent-warn-text)]">
        exp is not a numeric timestamp: {JSON.stringify(expiry.value)}
      </p>
    );
  }
  // Time and locale differ between server and browser, so render them only after mount.
  if (now === null) {
    return <p className="text-[color:var(--text-muted)]">{expiry.expiresAt.toISOString()}</p>;
  }

  const remaining = expiry.expiresAt.getTime() - now;
  const statusColor =
    remaining <= 0
      ? "text-[color:var(--error)]"
      : remaining < EXPIRING_SOON_MS
        ? "text-[color:var(--accent-warn-text)]"
        : "text-[color:var(--accent-text)]";
  return (
    <div className="space-y-1">
      <p className={`font-semibold ${statusColor}`}>
        {remaining <= 0 ? `Expired ${formatDuration(remaining)} ago` : `Expires in ${formatDuration(remaining)}`}
      </p>
      <p>{expiry.expiresAt.toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" })}</p>
      <p className="text-xs text-[color:var(--text-muted)]">{expiry.expiresAt.toISOString()}</p>
    </div>
  );
}

function SignatureStatus({ alg, verified, hmac }: { alg: string | null; verified: VerifyResult | null; hmac: boolean }) {
  const base = "mt-2 font-[family-name:var(--font-ui)] text-sm";
  if (!alg) return null;
  if (!verified) return <p className={`${base} text-[color:var(--text-muted)]`}>Not verified. Enter the {hmac ? "secret" : "public key"} to check it.</p>;
  if (!verified.ok) return <p className={`${base} text-[color:var(--text-muted)]`}>{verified.error}</p>;
  return (
    <div role="status" className={base}>
      <p className={`font-semibold ${verified.valid ? "text-[color:var(--accent-text)]" : "text-[color:var(--error)]"}`}>
        {verified.valid ? "Signature verified" : "Invalid signature"}
      </p>
      <p className="text-[color:var(--text-muted)]">
        {verified.valid
          ? `Signed with this ${hmac ? "secret" : "key"} using ${verified.alg}, and not changed since. The claims still need checking: expiry, issuer, audience.`
          : (verified.note ?? `The token was changed after signing, or signed with a different ${hmac ? "secret" : "key"}.`)}
      </p>
    </div>
  );
}

const blockClass = "overflow-x-auto whitespace-pre-wrap break-all";

export default function JwtDecoder() {
  const [token, setToken] = useToolInput(EXAMPLE_TOKEN);
  const result = useMemo(() => (token.trim() === "" ? null : decodeJwt(token)), [token]);
  // The secret and key stay in memory only: never in the URL, storage or snippets.
  const [secret, setSecret] = useState("");
  const [secretFormat, setSecretFormat] = useState<KeyFormat>("text");
  const [publicKey, setPublicKey] = useState("");
  const [verified, setVerified] = useState<VerifyResult | null>(null);

  const header = result?.ok ? (result.jwt.header as { alg?: unknown } | null) : null;
  const alg = header && typeof header === "object" && isAlgorithm(header.alg) ? header.alg : null;
  const hmac = alg !== null && algorithmInfo(alg).family === "hmac";
  const keyEntered = hmac ? secret !== "" : publicKey.trim() !== "";

  useEffect(() => {
    if (!alg || !keyEntered) return setVerified(null);
    let cancelled = false;
    verifyJwt({ token, secret, secretFormat, key: publicKey }).then((r) => !cancelled && setVerified(r));
    return () => {
      cancelled = true;
    };
  }, [alg, keyEntered, token, secret, secretFormat, publicKey]);

  const copyText = result?.ok
    ? JSON.stringify(
        { header: result.jwt.header, payload: result.jwt.payload, signature: result.jwt.signature },
        null,
        2,
      )
    : undefined;

  return (
    <>
      <InputPanel label="Encoded token">
        <CodeTextArea
          aria-label="Encoded token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste a JWT (eyJhbGciOi...)"
          rows={10}
          invalid={result?.ok === false}
          aria-describedby={result?.ok === false ? "jwt-error" : undefined}
          className="break-all"
        />
        <p className="mt-2 text-xs text-[color:var(--text-muted)]">Decoding happens in your browser.</p>

        {result?.ok && (
          <fieldset className="mt-4 min-w-0 space-y-3 border-t border-[color:var(--border)] pt-4">
            <legend className="sr-only">Verify signature</legend>
            <h2 className="text-sm font-medium">Verify signature</h2>
            {!alg ? (
              <p className="text-sm text-[color:var(--text-muted)]">
                {header && typeof header === "object" && header.alg === "none"
                  ? "alg is none: this token isn’t signed, so anyone could have written it. Never accept one."
                  : `The header’s alg ${JSON.stringify(header && typeof header === "object" ? header.alg : undefined)} isn’t one this tool can verify.`}
              </p>
            ) : hmac ? (
              <SecretInput
                id="jwt-verify-secret"
                secret={secret}
                onSecret={setSecret}
                format={secretFormat}
                onFormat={setSecretFormat}
                help={`This token uses ${alg}. Enter the secret it was signed with.`}
              />
            ) : (
              <Field
                label="Public key"
                htmlFor="jwt-verify-key"
                help={`This token uses ${alg}, which needs ${keyNeeded(algorithmInfo(alg))}. PEM public key or certificate, JWK, or a JWK Set (the kid picks the key).`}
              >
                <CodeTextArea
                  id="jwt-verify-key"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  rows={5}
                  placeholder="-----BEGIN PUBLIC KEY-----"
                  spellCheck={false}
                  autoComplete="off"
                  className="break-all"
                />
              </Field>
            )}
            {alg && <p className="text-xs text-[color:var(--text-muted)]">Checked in your browser. The {hmac ? "secret" : "key"} isn’t saved or put in the link.</p>}
          </fieldset>
        )}
      </InputPanel>

      <OutputPanel label="Decoded" copyText={copyText} outputType="json">
        {result === null && <p className="text-[color:var(--text-muted)]">Paste a token to decode it.</p>}

        {result?.ok === false && (
          <Alert id="jwt-error" title="Invalid token">
            {result.error}
          </Alert>
        )}

        {result?.ok && (
          <div className="space-y-6">
            <Section label="Header">
              <pre className={blockClass}>{JSON.stringify(result.jwt.header, null, 2)}</pre>
            </Section>
            <Section label="Payload">
              <pre className={blockClass}>{JSON.stringify(result.jwt.payload, null, 2)}</pre>
            </Section>
            <Section label="Signature">
              <pre className={blockClass}>
                {result.jwt.signature || (
                  <span className="text-[color:var(--text-muted)]">(empty: unsigned token)</span>
                )}
              </pre>
              <SignatureStatus alg={alg} verified={keyEntered ? verified : null} hmac={hmac} />
            </Section>
            <Section label="Expiry">
              <ExpiryDetails expiry={getExpiry(result.jwt.payload)} />
            </Section>
          </div>
        )}
      </OutputPanel>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import { decodeJwt, formatDuration, getExpiry, type ExpiryInfo } from "@/lib/tools/developer/jwt";

// Real HS256 token signed with the secret "your-256-bit-secret"; expires 2031-01-01.
const EXAMPLE_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImVtYWlsIjoiYWRhQGV4YW1wbGUuY29tIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzM1Njg5NjAwLCJleHAiOjE5MjQ5OTIwMDB9.V-GZZDP_65htbNewPaxGMfEnN_UlGTjctwqp6kot9QY";

const EXPIRING_SOON_MS = 5 * 60 * 1000;

/** Current time, ticking every second. Null during SSR and the first client render. */
function useNow(enabled: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 font-[family-name:var(--font-ui)] text-xs font-medium uppercase tracking-wide text-[color:var(--accent-text)]">
        {label}
      </h2>
      {children}
    </div>
  );
}

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

const blockClass = "overflow-x-auto whitespace-pre-wrap break-all";

export default function JwtDecoder() {
  const [token, setToken] = useState(EXAMPLE_TOKEN);
  const result = useMemo(() => (token.trim() === "" ? null : decodeJwt(token)), [token]);

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
        <textarea
          aria-label="Encoded token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste a JWT (eyJhbGciOi...)"
          rows={10}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={result?.ok === false}
          aria-describedby={result?.ok === false ? "jwt-error" : undefined}
          className={`w-full resize-y break-all rounded-md border bg-transparent p-3 font-[family-name:var(--font-mono)] text-sm focus:outline focus:outline-1 ${
            result?.ok === false
              ? "border-[color:var(--error)] focus:outline-[color:var(--error)]"
              : "border-[color:var(--border)] focus:outline-[color:var(--accent)]"
          }`}
        />
        <p className="mt-2 text-xs text-[color:var(--text-muted)]">
          Decoding happens in your browser. The signature is not verified.
        </p>
      </InputPanel>

      <OutputPanel label="Decoded" copyText={copyText}>
        {result === null && <p className="text-[color:var(--text-muted)]">Paste a token to decode it.</p>}

        {result?.ok === false && (
          <div
            id="jwt-error"
            role="alert"
            className="rounded-md border border-[color:color-mix(in_srgb,var(--error)_40%,transparent)] p-4 text-[color:var(--error)]"
          >
            <p className="font-semibold">Invalid token</p>
            <p className="mt-1">{result.error}</p>
          </div>
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

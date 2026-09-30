"use client";

import { useMemo } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import { CodeTextArea } from "@/components/ui/CodeField";
import Section from "@/components/ui/Section";
import { useNow } from "@/lib/hooks/useNow";
import { decodeJwt, formatDuration, getExpiry, type ExpiryInfo } from "@/lib/tools/developer/jwt";

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

const blockClass = "overflow-x-auto whitespace-pre-wrap break-all";

export default function JwtDecoder() {
  const [token, setToken] = useToolInput(EXAMPLE_TOKEN);
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
        <p className="mt-2 text-xs text-[color:var(--text-muted)]">
          Decoding happens in your browser. The signature is not verified.
        </p>
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

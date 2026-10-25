"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, RefreshCw, Shuffle } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { CopyButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import ErrorLocation from "@/components/ui/ErrorLocation";
import Field from "@/components/ui/Field";
import Section from "@/components/ui/Section";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import ValueTable from "@/components/ui/ValueTable";
import type { KeyFormat } from "@/lib/encoding/key-bytes";
import { useNow } from "@/lib/hooks/useNow";
import { parseJson } from "@/lib/tools/developer/json-format";
import { formatDuration } from "@/lib/tools/developer/jwt";
import { buildPayload, type ClaimsForm } from "@/lib/tools/developer/jwt-claims";
import { ALGORITHMS, algorithmInfo, generateKeyPair, keyNeeded, randomSecret, signJwt, usesSecret, type JwtAlgorithm, type SignResult } from "@/lib/tools/developer/jwt-sign";
import SecretInput from "./jwt/SecretInput";

const GROUPS: { label: string; family: string }[] = [
  { label: "HMAC (shared secret)", family: "hmac" },
  { label: "RSA", family: "rsa" },
  { label: "RSA-PSS", family: "rsa-pss" },
  { label: "ECDSA", family: "ecdsa" },
  { label: "EdDSA", family: "eddsa" },
];

const EXAMPLE_CLAIMS = JSON.stringify({ name: "Ada Lovelace", email: "ada@example.com", role: "admin" }, null, 2);

const DEFAULT_FORM: ClaimsForm = { iss: "https://auth.example.com", sub: "user_123", aud: "api.example.com", jti: "", iat: true, exp: "1h", nbf: "" };

const EXPIRY_PRESETS = ["15m", "1h", "1d", "30d"];

type CustomClaims =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string; location?: { line: number; column: number; offset: number } };

const KEY_VIEWS = [
  { id: "pem", label: "PEM" },
  { id: "jwk", label: "JWK" },
] as const;

const TIME_CLAIMS = [
  { claim: "iat", label: "Issued (iat)" },
  { claim: "nbf", label: "Valid from (nbf)" },
  { claim: "exp", label: "Expires (exp)" },
] as const;

/** What kind of key an algorithm takes: algorithms with the same kind can share one. */
function keyKind(id: JwtAlgorithm): string {
  const a = algorithmInfo(id);
  return a.family === "hmac" ? `secret-${a.hash}` : a.family === "rsa" || a.family === "rsa-pss" ? "RSA" : a.curve!;
}

function localDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "long" });
}

export default function JwtGenerator() {
  const claimsRef = useRef<HTMLTextAreaElement>(null);
  const [alg, setAlg] = useState<JwtAlgorithm>("HS256");
  // Secrets and keys stay in memory only: never in the URL, storage or snippets.
  const [secret, setSecret] = useState("");
  const [secretFormat, setSecretFormat] = useState<KeyFormat>("text");
  const [privateKey, setPrivateKey] = useState("");
  /** The secret and key this tool generated, so switching algorithm can replace them but never ones you typed. */
  const generatedSecret = useRef("");
  const generatedKey = useRef("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [kid, setKid] = useState("");
  const [typ, setTyp] = useState(true);
  const [form, setForm] = useState<ClaimsForm>(DEFAULT_FORM);
  const [claimsText, setClaimsText] = useToolInput(EXAMPLE_CLAIMS);
  const [issuedAt, setIssuedAt] = useState(0);
  const [result, setResult] = useState<SignResult | null>(null);
  const [keyView, setKeyView] = useState<"pem" | "jwk">("pem");
  const now = useNow();

  const info = algorithmInfo(alg);
  const hmac = usesSecret(alg);

  // Random and time-based values are set after mount so server and client render the same.
  useEffect(() => {
    setIssuedAt(Math.floor(Date.now() / 1000));
    newSecret("HS256");
  }, []);

  const custom = useMemo((): CustomClaims => {
    if (!claimsText.trim()) return { ok: true, value: {} };
    const parsed = parseJson(claimsText);
    if (!parsed.ok) return { ok: false, message: parsed.error.message, location: parsed.error };
    const value: unknown = JSON.parse(claimsText);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, message: "Custom claims must be a JSON object, like {\"role\": \"admin\"}." };
    return { ok: true, value: value as Record<string, unknown> };
  }, [claimsText]);

  const built = useMemo(() => (custom.ok ? buildPayload(form, custom.value, issuedAt) : null), [custom, form, issuedAt]);
  const header = useMemo(() => ({ ...(typ ? { typ: "JWT" } : {}), ...(kid.trim() ? { kid: kid.trim() } : {}) }), [typ, kid]);
  const formErrors = built ? Object.keys(built.errors).length > 0 : false;

  useEffect(() => {
    if (!built || formErrors || !issuedAt) return setResult(null);
    let cancelled = false;
    signJwt({ alg, header, payload: built.payload, secret, secretFormat, privateKey }).then((r) => !cancelled && setResult(r));
    return () => {
      cancelled = true;
    };
  }, [alg, header, built, formErrors, issuedAt, secret, secretFormat, privateKey]);

  async function newKeyPair(forAlg: JwtAlgorithm) {
    setGenerating(true);
    setKeyError(null);
    const r = await generateKeyPair(forAlg);
    setGenerating(false);
    if (!r.ok) {
      setKeyError(r.error);
      // Drop a key this tool made for another algorithm, so the output doesn't blame the key.
      setPrivateKey((key) => (key === generatedKey.current ? "" : key));
      return;
    }
    generatedKey.current = r.pair.privatePem;
    setPrivateKey(r.pair.privatePem);
  }

  function newSecret(forAlg: JwtAlgorithm) {
    const value = randomSecret(forAlg);
    generatedSecret.current = value;
    setSecret(value);
  }

  function changeAlg(next: JwtAlgorithm) {
    setAlg(next);
    setKeyError(null);
    if (keyKind(next) === keyKind(alg)) return;
    // A secret or key this tool made is swapped for one that fits; one you typed or pasted is left alone.
    if (usesSecret(next)) {
      if (secret === generatedSecret.current) newSecret(next);
    } else if (!privateKey.trim() || privateKey === generatedKey.current) {
      void newKeyPair(next);
    }
  }

  const setClaim = <K extends keyof ClaimsForm>(key: K, value: ClaimsForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  function showClaimsError(offset: number) {
    const input = claimsRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(offset, Math.min(offset + 1, claimsText.length));
  }

  const token = result?.ok ? result.token : undefined;
  const [h, p, s] = token ? token.split(".") : [];
  const payload = built?.payload ?? {};
  const exp = typeof payload.exp === "number" ? payload.exp : undefined;
  const nbf = typeof payload.nbf === "number" ? payload.nbf : undefined;
  const nowSeconds = now === null ? null : Math.floor(now / 1000);
  const publicJwk = result?.ok && result.publicKey ? JSON.stringify({ ...result.publicKey.jwk, ...(kid.trim() ? { kid: kid.trim() } : {}), alg, use: "sig" }, null, 2) : "";

  return (
    <>
      <InputPanel label="Token settings">
        <div className="space-y-4">
          <Field label="Algorithm" htmlFor="jwt-alg">
            <Select id="jwt-alg" value={alg} onChange={(e) => changeAlg(e.target.value as JwtAlgorithm)}>
              {GROUPS.map((g) => (
                <optgroup key={g.family} label={g.label}>
                  {ALGORITHMS.filter((a) => a.family === g.family).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          {hmac ? (
            <SecretInput
              id="jwt-secret"
              secret={secret}
              onSecret={setSecret}
              format={secretFormat}
              onFormat={setSecretFormat}
              invalid={result?.ok === false}
              action={
                <Button size="sm" icon={Shuffle} onClick={() => newSecret(alg)}>
                  Random
                </Button>
              }
              help={`Your server verifies with the same secret. Text is used as typed; most libraries treat a string secret that way.`}
            />
          ) : (
            <Field
              label="Private key"
              htmlFor="jwt-private-key"
              action={
                <Button size="sm" icon={KeyRound} onClick={() => newKeyPair(alg)} disabled={generating}>
                  {generating ? "Generating…" : "Generate key pair"}
                </Button>
              }
              help={`${info.id} needs ${keyNeeded(info)}. PEM (PKCS#8, PKCS#1 or SEC1) or a private JWK. The public key to verify with is in the output.`}
            >
              <CodeTextArea
                id="jwt-private-key"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                rows={6}
                placeholder="-----BEGIN PRIVATE KEY-----"
                spellCheck={false}
                autoComplete="off"
                className="break-all"
              />
            </Field>
          )}
          {keyError && (
            <p role="alert" className="text-sm text-[color:var(--error)]">
              {keyError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Key ID (kid)" htmlFor="jwt-kid" help="Optional. Tells the verifier which key to use.">
              <CodeInput id="jwt-kid" value={kid} onChange={(e) => setKid(e.target.value)} spellCheck={false} />
            </Field>
            <div className="sm:pt-8">
              <Checkbox checked={typ} onChange={setTyp}>
                Add typ: JWT to the header
              </Checkbox>
            </div>
          </div>

          <fieldset className="min-w-0 space-y-4 border-t border-[color:var(--border)] pt-4">
            <legend className="sr-only">Registered claims</legend>
            <h2 className="text-sm font-medium">Claims</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issuer (iss)" htmlFor="jwt-iss">
                <CodeInput id="jwt-iss" value={form.iss} onChange={(e) => setClaim("iss", e.target.value)} spellCheck={false} />
              </Field>
              <Field label="Subject (sub)" htmlFor="jwt-sub">
                <CodeInput id="jwt-sub" value={form.sub} onChange={(e) => setClaim("sub", e.target.value)} spellCheck={false} />
              </Field>
              <Field label="Audience (aud)" htmlFor="jwt-aud" help="Separate several with commas.">
                <CodeInput id="jwt-aud" value={form.aud} onChange={(e) => setClaim("aud", e.target.value)} spellCheck={false} />
              </Field>
              <Field
                label="Token ID (jti)"
                htmlFor="jwt-jti"
                action={
                  <button type="button" onClick={() => setClaim("jti", crypto.randomUUID())} className="text-xs text-[color:var(--accent-text)] hover:underline">
                    Random
                  </button>
                }
              >
                <CodeInput id="jwt-jti" value={form.jti} onChange={(e) => setClaim("jti", e.target.value)} spellCheck={false} />
              </Field>
              <Field
                label="Expires after (exp)"
                htmlFor="jwt-exp"
                help={
                  built?.errors.exp ?? (
                    <>
                      Like 15m, 1h or 7d; blank for none.{" "}
                      {EXPIRY_PRESETS.map((preset, i) => (
                        <span key={preset}>
                          {i > 0 && ", "}
                          <button type="button" onClick={() => setClaim("exp", preset)} className="font-[family-name:var(--font-mono)] text-[color:var(--accent-text)] hover:underline">
                            {preset}
                          </button>
                        </span>
                      ))}
                    </>
                  )
                }
              >
                <CodeInput
                  id="jwt-exp"
                  value={form.exp}
                  onChange={(e) => setClaim("exp", e.target.value)}
                  invalid={Boolean(built?.errors.exp)}
                  placeholder="No expiry"
                  spellCheck={false}
                />
              </Field>
              <Field label="Valid after (nbf)" htmlFor="jwt-nbf" help={built?.errors.nbf ?? "Delay before it’s valid; 0 for now, blank for none."}>
                <CodeInput
                  id="jwt-nbf"
                  value={form.nbf}
                  onChange={(e) => setClaim("nbf", e.target.value)}
                  invalid={Boolean(built?.errors.nbf)}
                  placeholder="None"
                  spellCheck={false}
                />
              </Field>
            </div>
            <Checkbox checked={form.iat} onChange={(v) => setClaim("iat", v)}>
              Add issued-at time (iat)
            </Checkbox>
          </fieldset>

          <Field label="Custom claims" htmlFor="jwt-claims" help="A JSON object, added after the claims above. A key set in both uses the value here.">
            <CodeTextArea
              ref={claimsRef}
              id="jwt-claims"
              value={claimsText}
              onChange={(e) => setClaimsText(e.target.value)}
              rows={8}
              invalid={!custom.ok}
              aria-describedby={!custom.ok ? "jwt-claims-error" : undefined}
              spellCheck={false}
            />
          </Field>
          {!custom.ok && (
            <Alert id="jwt-claims-error" title="Custom claims aren’t valid">
              <p>{custom.message}</p>
              {custom.location && (
                <ErrorLocation
                  source={claimsText}
                  line={custom.location.line}
                  column={custom.location.column}
                  onShow={() => !custom.ok && custom.location && showClaimsError(custom.location.offset)}
                />
              )}
            </Alert>
          )}

          <p className="text-xs text-[color:var(--text-muted)]">
            Signed in your browser. Use test keys: secrets and keys stay in this tab and aren’t saved or put in the link.
          </p>
        </div>
      </InputPanel>

      <OutputPanel label="JWT" copyText={token} outputType="jwt">
        <div className="space-y-6">
          {!custom.ok || formErrors ? (
            <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">Fix the highlighted fields to sign a token.</p>
          ) : result?.ok === false ? (
            <Alert title="Can’t sign yet">{result.error}</Alert>
          ) : null}

          {result?.ok && token && (
            <>
              {result.warning && (
                <Alert tone="warn" title="Check the key">
                  {result.warning}
                </Alert>
              )}
              <p className="break-all font-[family-name:var(--font-mono)] leading-relaxed" aria-label="Signed token">
                <span className="text-[color:var(--syntax-keyword)]">{h}</span>.<span className="text-[color:var(--syntax-string)]">{p}</span>.
                <span className="text-[color:var(--syntax-type)]">{s}</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                <span>
                  <span className="text-[color:var(--syntax-keyword)]">Header</span> · <span className="text-[color:var(--syntax-string)]">Payload</span> ·{" "}
                  <span className="text-[color:var(--syntax-type)]">Signature</span> · {token.length.toLocaleString()} characters
                </span>
                <span className="ml-auto flex items-center gap-1">
                  As a header <CopyButton text={`Authorization: Bearer ${token}`} what="as Authorization header" />
                </span>
              </div>

              <Section label="Header">
                <pre className="overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(result.header, null, 2)}</pre>
              </Section>
              <Section label="Payload">
                <pre className="overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(payload, null, 2)}</pre>
                {built && built.overridden.length > 0 && (
                  <p className="mt-2 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                    {built.overridden.join(", ")} come{built.overridden.length === 1 ? "s" : ""} from the custom claims, replacing the field above.
                  </p>
                )}
              </Section>

              <Section label="Times">
                <div className="font-[family-name:var(--font-ui)]">
                  {TIME_CLAIMS.some(({ claim }) => typeof payload[claim] === "number") ? (
                    <ValueTable
                      rows={TIME_CLAIMS.filter(({ claim }) => typeof payload[claim] === "number").map(({ claim, label }) => {
                        const seconds = payload[claim] as number;
                        const diff = nowSeconds === null ? null : seconds - nowSeconds;
                        return {
                          key: claim,
                          label,
                          value: String(seconds),
                          note: (
                            <>
                              {localDate(seconds)}
                              {diff !== null && Math.abs(diff) >= 1 && ` · ${diff > 0 ? `in ${formatDuration(diff * 1000)}` : `${formatDuration(diff * 1000)} ago`}`}
                            </>
                          ),
                          highlight: claim === "exp" && diff !== null && diff <= 0 ? "mismatch" : undefined,
                        };
                      })}
                    />
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    {exp === undefined ? (
                      <span className="text-[color:var(--accent-warn-text)]">No exp: this token never expires.</span>
                    ) : nowSeconds !== null && exp <= nowSeconds ? (
                      <span className="text-[color:var(--error)]">Expired. Re-sign to issue it from now.</span>
                    ) : (
                      <span className="text-[color:var(--text-muted)]">Times count from when it was signed.</span>
                    )}
                    {nbf !== undefined && exp !== undefined && exp <= nbf && <span className="text-[color:var(--error)]">exp is not after nbf, so it’s never valid.</span>}
                    <Button size="sm" icon={RefreshCw} onClick={() => setIssuedAt(Math.floor(Date.now() / 1000))}>
                      Sign again now
                    </Button>
                  </div>
                </div>
              </Section>

              {result.publicKey && (
                <Section label="Public key, to verify">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 font-[family-name:var(--font-ui)]">
                      <SegmentedControl label="Public key format" options={KEY_VIEWS} value={keyView} onChange={setKeyView} />
                      <span className="text-xs text-[color:var(--text-muted)]">
                        <CopyButton text={keyView === "pem" ? result.publicKey.pem : publicJwk} what="public key" />
                      </span>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-[color:var(--border)] p-3 text-xs">
                      {keyView === "pem" ? result.publicKey.pem : publicJwk}
                    </pre>
                    <p className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                      Safe to share: it only verifies. Keep the private key on the server that signs.
                    </p>
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

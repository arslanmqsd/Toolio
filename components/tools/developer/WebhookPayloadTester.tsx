"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { CopyButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import ErrorLocation from "@/components/ui/ErrorLocation";
import Field from "@/components/ui/Field";
import PasswordInput from "@/components/ui/PasswordInput";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import { formatBytes } from "@/lib/format-bytes";
import { useNow } from "@/lib/hooks/useNow";
import { parseJson, printJson } from "@/lib/tools/developer/json-format";
import { flatten, type PathStyle } from "@/lib/tools/developer/webhook/inspect";
import { buildRequest, checkUrl, requestHeaders, type RequestFormat } from "@/lib/tools/developer/webhook/request";
import {
  DEFAULT_CUSTOM,
  schemeInfo,
  SCHEMES,
  sign,
  TOLERANCE_SECONDS,
  usesId,
  usesTimestamp,
  verify,
  type CustomScheme,
  type Scheme,
  type SignResult,
  type VerifyResult,
} from "@/lib/tools/developer/webhook/signature";
import { TEMPLATES, templateById, templateText, type WebhookTemplate } from "@/lib/tools/developer/webhook/templates";
import CustomSchemeEditor from "./webhook/CustomSchemeEditor";
import FieldTree from "./webhook/FieldTree";
import HeaderEditor, { type HeaderRow } from "./webhook/HeaderEditor";

const TABS = [
  { id: "structure", label: "Structure" },
  { id: "signature", label: "Signature" },
  { id: "request", label: "Request" },
  { id: "verify", label: "Verify" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const BODY_MODES = [
  { id: "minified", label: "Minified" },
  { id: "written", label: "As written" },
] as const;
type BodyMode = (typeof BODY_MODES)[number]["id"];

const FORMATS = [
  { id: "curl", label: "curl" },
  { id: "powershell", label: "PowerShell" },
  { id: "fetch", label: "fetch" },
] as const;

const PATH_STYLES = [
  { id: "js", label: "JavaScript" },
  { id: "jsonpath", label: "JSONPath" },
] as const;

const FIRST = TEMPLATES[0];

const headerRows = (t: WebhookTemplate): HeaderRow[] => t.headers.map(([name, value], i) => ({ id: i + 1, name, value }));

function randomMessageId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `msg_${Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 24)}`;
}

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds} s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

export default function WebhookPayloadTester() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useToolInput(templateText(FIRST));
  const [pendingTemplate, setPendingTemplate] = useState(FIRST.id);
  const [scheme, setScheme] = useState<Scheme>(FIRST.scheme);
  // The secret stays in memory only: never in the URL, storage, snippets or the generated commands.
  const [secret, setSecret] = useState("");
  const [custom, setCustom] = useState<CustomScheme>(DEFAULT_CUSTOM);
  const [extraHeaders, setExtraHeaders] = useState<HeaderRow[]>(headerRows(FIRST));
  const [messageId, setMessageId] = useState("");
  const [timestamp, setTimestamp] = useState(0);
  const [bodyMode, setBodyMode] = useState<BodyMode>("minified");
  const [tab, setTab] = useState<Tab>("structure");
  const [pathStyle, setPathStyle] = useState<PathStyle>("js");
  const [url, setUrl] = useState("http://localhost:3000/api/webhooks");
  const [format, setFormat] = useState<RequestFormat>("curl");
  const [signed, setSigned] = useState<SignResult | null>(null);

  const [received, setReceived] = useState("");
  const [receivedTimestamp, setReceivedTimestamp] = useState("");
  const [receivedId, setReceivedId] = useState("");
  const [verified, setVerified] = useState<VerifyResult | null>(null);

  const now = useNow(tab === "signature" || tab === "request");

  // Random and time-based values are set after mount so server and client render the same.
  useEffect(() => {
    setMessageId(randomMessageId());
    setTimestamp(Math.floor(Date.now() / 1000));
  }, []);

  const deferredText = useDeferredValue(text);
  const parsed = useMemo(() => parseJson(deferredText), [deferredText]);
  const body = useMemo(
    () => (parsed.ok ? (bodyMode === "minified" ? printJson(parsed.value, { indent: "", sortKeys: false }) : deferredText) : ""),
    [parsed, bodyMode, deferredText],
  );
  const tree = useMemo(() => (parsed.ok ? flatten(parsed.value) : null), [parsed]);
  const info = schemeInfo(scheme);
  const timed = usesTimestamp(scheme, custom);
  const withId = usesId(scheme, custom);

  useEffect(() => {
    if (!parsed.ok || !timestamp) return setSigned(null);
    let cancelled = false;
    sign({ scheme, secret, body, timestamp, messageId, custom }).then((r) => !cancelled && setSigned(r));
    return () => {
      cancelled = true;
    };
  }, [parsed.ok, scheme, secret, body, timestamp, messageId, custom]);

  useEffect(() => {
    if (tab !== "verify") return;
    let cancelled = false;
    // Verify the payload exactly as it sits in the box: that's the raw body as received.
    verify({
      scheme,
      secret,
      body: text,
      signature: received,
      timestamp: receivedTimestamp,
      messageId: receivedId,
      custom,
      now: Math.floor(Date.now() / 1000),
    }).then((r) => !cancelled && setVerified(r));
    return () => {
      cancelled = true;
    };
  }, [tab, scheme, secret, text, received, receivedTimestamp, receivedId, custom]);

  // Signature headers come before your own, so a same-named custom header can't replace them.
  const extra = extraHeaders.filter((h) => h.name.trim()).map((h): [string, string] => [h.name.trim(), h.value]);
  const headers = requestHeaders([...(signed?.ok ? signed.headers : []), ...extra]);
  const urlError = checkUrl(url);
  const command = parsed.ok && !urlError ? buildRequest(format, { url: url.trim(), headers, body }) : "";
  const age = now !== null && timestamp ? Math.floor(now / 1000) - timestamp : 0;

  function showError(offset: number) {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(offset, Math.min(offset + 1, text.length));
  }

  function loadTemplate() {
    const t = templateById(pendingTemplate);
    if (!t) return;
    setText(templateText(t));
    setScheme(t.scheme);
    setExtraHeaders(headerRows(t));
  }

  const copyText = !parsed.ok
    ? undefined
    : tab === "structure"
      ? body
      : tab === "signature"
        ? signed?.ok
          ? headers.map(([k, v]) => `${k}: ${v}`).join("\n")
          : undefined
        : tab === "request"
          ? command || undefined
          : undefined;

  return (
    <>
      <InputPanel label="Payload">
        <div className="space-y-4">
          <div className="flex gap-2">
            <Select aria-label="Sample payload" value={pendingTemplate} onChange={(e) => setPendingTemplate(e.target.value)} className="min-w-0 flex-1">
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Button onClick={loadTemplate}>Load sample</Button>
          </div>
          <p className="text-xs text-[color:var(--text-muted)]">
            Samples follow each provider’s documented shape with made-up ids. Real events have more fields; check the provider’s docs for the exact schema.
          </p>

          <CodeTextArea
            ref={inputRef}
            aria-label="JSON payload"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            invalid={!parsed.ok}
            aria-describedby={!parsed.ok ? "webhook-json-error" : undefined}
            spellCheck={false}
          />

          <Field label="Body to send and sign" help="Minified is what most providers send. Choose As written to sign the text exactly as it is above.">
            <SegmentedControl label="Body to send and sign" options={BODY_MODES} value={bodyMode} onChange={setBodyMode} />
          </Field>

          <fieldset className="min-w-0 space-y-4 border-t border-[color:var(--border)] pt-4">
            <legend className="sr-only">Signing</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Signature scheme" htmlFor="webhook-scheme">
                <Select id="webhook-scheme" value={scheme} onChange={(e) => setScheme(e.target.value as Scheme)}>
                  {SCHEMES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {scheme !== "none" && (
                <Field label="Signing secret" htmlFor="webhook-secret" help={info.secretHelp}>
                  <PasswordInput
                    id="webhook-secret"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={scheme === "stripe" || scheme === "standard" ? "whsec_…" : "Your test secret"}
                  />
                </Field>
              )}
            </div>
            {scheme === "custom" && <CustomSchemeEditor value={custom} onChange={setCustom} />}
            <Field label="Other headers" help="Sent with every request, after the signature headers. Event type, delivery id, auth for your endpoint…">
              <HeaderEditor rows={extraHeaders} onChange={setExtraHeaders} />
            </Field>
            <p className="text-xs text-[color:var(--text-muted)]">
              Use a test secret. It stays in this tab: it isn’t saved, put in the link, or included in the commands.
            </p>
          </fieldset>
        </div>
      </InputPanel>

      <OutputPanel label="Webhook" copyText={copyText} outputType={tab === "structure" ? "json" : undefined}>
        <div className="space-y-4 font-[family-name:var(--font-ui)]">
          <SegmentedControl label="View" options={TABS} value={tab} onChange={setTab} variant="tabs" />

          {!parsed.ok ? (
            <Alert id="webhook-json-error" title={deferredText.trim() ? "Invalid JSON" : "Nothing to inspect"}>
              <p>{parsed.error.message}</p>
              {deferredText.trim() !== "" && (
                <ErrorLocation
                  source={deferredText}
                  line={parsed.error.line}
                  column={parsed.error.column}
                  onShow={() => !parsed.ok && showError(parsed.error.offset)}
                />
              )}
            </Alert>
          ) : tab === "structure" && tree ? (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                {[
                  ["Fields", (tree.total - 1).toLocaleString()],
                  ["Depth", String(parsed.stats.depth)],
                  ["Body size", formatBytes(new TextEncoder().encode(body).length)],
                  ["Root", parsed.stats.root],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-[color:var(--text-muted)]">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {parsed.stats.unsafeIntegers > 0 && (
                <p className="text-sm text-[color:var(--accent-warn-text)]">
                  {parsed.stats.unsafeIntegers === 1 ? "1 integer is" : `${parsed.stats.unsafeIntegers} integers are`} beyond 2^53. JSON.parse rounds them, so
                  ids like these lose digits: read them as strings, or use a parser that keeps big integers.
                </p>
              )}
              {parsed.stats.duplicateKeys.length > 0 && (
                <p className="text-sm text-[color:var(--accent-warn-text)]">
                  Duplicate keys: {[...new Set(parsed.stats.duplicateKeys)].join(", ")}. Most parsers keep only the last one.
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-[color:var(--text-muted)]">Copy paths as</span>
                <SegmentedControl label="Path style" options={PATH_STYLES} value={pathStyle} onChange={setPathStyle} />
              </div>
              <div className="font-[family-name:var(--font-mono)]">
                <FieldTree rows={tree.rows} pathStyle={pathStyle} />
              </div>
              {tree.truncated && (
                <p className="text-xs text-[color:var(--text-muted)]">
                  Showing the first {tree.rows.length.toLocaleString()} of {tree.total.toLocaleString()} fields.
                </p>
              )}
            </div>
          ) : tab === "signature" ? (
            <div className="space-y-4 text-sm">
              {!signed ? null : !signed.ok ? (
                <p className="text-[color:var(--text-muted)]">{signed.error}</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {headers.map(([name, value]) => (
                      <li key={name} className="flex items-start gap-2 rounded-md border border-[color:var(--border)] p-2">
                        <code className="min-w-0 flex-1 break-all font-[family-name:var(--font-mono)]">
                          <span className="text-[color:var(--text-muted)]">{name}:</span> {value}
                        </code>
                        <span className="text-xs text-[color:var(--text-muted)]">
                          <CopyButton text={value} what={`${name} value`} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[color:var(--text-muted)]">
                    {scheme === "none" ? (
                      "No signature: the receiver can only trust these headers if it checks a token in them or who sent the request."
                    ) : (
                      <>
                        HMAC-
                        {scheme === "custom" ? custom.algorithm : "SHA-256"} of{" "}
                        {scheme === "custom" ? <code className="font-[family-name:var(--font-mono)]">{custom.template}</code> : info.signs}
                        {scheme === "standard" || (scheme === "custom" && custom.keyFormat !== "text")
                          ? `, keyed with the ${scheme === "custom" && custom.keyFormat === "hex" ? "hex" : "base64"}-decoded secret`
                          : ""}
                        .
                      </>
                    )}{" "}
                    The body is {bodyMode === "minified" ? "the minified JSON" : "the text exactly as written"},{" "}
                    {formatBytes(new TextEncoder().encode(body).length)}.
                  </p>
                </>
              )}
              {timed && timestamp > 0 && (
                <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] pt-3">
                  <span>
                    Timestamp <code className="font-[family-name:var(--font-mono)]">{timestamp}</code>
                    {now !== null && <span className="text-[color:var(--text-muted)]"> · signed {ago(Math.max(0, age))}</span>}
                  </span>
                  <Button size="sm" icon={RefreshCw} onClick={() => setTimestamp(Math.floor(Date.now() / 1000))}>
                    Sign again now
                  </Button>
                  {age > TOLERANCE_SECONDS && (
                    <p className="w-full text-[color:var(--accent-warn-text)]">
                      Older than 5 minutes: receivers using the provider’s library will reject it as a possible replay.
                    </p>
                  )}
                </div>
              )}
              {withId && (
                <Field
                  label="Message id"
                  htmlFor="webhook-msgid"
                  help={`Sent as ${scheme === "custom" ? custom.idHeader : "webhook-id"} and signed. Receivers use it to ignore repeats.`}
                >
                  <CodeInput id="webhook-msgid" value={messageId} onChange={(e) => setMessageId(e.target.value)} />
                </Field>
              )}
              <p className="text-xs text-[color:var(--text-muted)]">
                The signature covers the exact bytes. Verify against the raw request body before parsing it: re-serializing the JSON, re-indenting it or
                changing line endings gives a different signature.
              </p>
            </div>
          ) : tab === "request" ? (
            <div className="space-y-4">
              <Field
                label="Your endpoint"
                htmlFor="webhook-url"
                help={urlError ?? "Where your app receives webhooks. A local URL works: the command runs on your machine."}
              >
                <CodeInput id="webhook-url" value={url} onChange={(e) => setUrl(e.target.value)} invalid={Boolean(urlError)} spellCheck={false} />
              </Field>
              <SegmentedControl label="Format" options={FORMATS} value={format} onChange={setFormat} />
              {command && (
                <pre className="overflow-x-auto whitespace-pre rounded-md border border-[color:var(--border)] p-3 font-[family-name:var(--font-mono)] text-sm">
                  {command}
                </pre>
              )}
              <p className="text-sm text-[color:var(--text-muted)]">
                Toolio doesn’t send this request. Run it yourself against an endpoint you control.
                {signed && !signed.ok && " Without a secret, it has no signature header."}
                {timed && age > TOLERANCE_SECONDS && " The signature is over 5 minutes old; sign again on the Signature tab before sending."}
              </p>
            </div>
          ) : tab === "verify" ? (
            <div className="space-y-4">
              <p className="text-sm text-[color:var(--text-muted)]">
                Paste the raw body you received into the payload box exactly as it arrived, set the scheme and secret, then the headers below.
              </p>
              {scheme === "none" ? (
                <p className="text-sm text-[color:var(--text-muted)]">
                  With No signature selected there’s nothing to verify. Choose the scheme the sender uses.
                </p>
              ) : (
                <>
                  <Field label={`${scheme === "custom" ? custom.header : info.header} header`} htmlFor="webhook-received">
                    <CodeInput
                      id="webhook-received"
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      spellCheck={false}
                      placeholder={scheme === "stripe" ? "t=…,v1=…" : undefined}
                    />
                  </Field>
                  {timed && scheme !== "stripe" && (
                    <Field
                      label={`${scheme === "slack" ? "X-Slack-Request-Timestamp" : scheme === "custom" ? custom.timestampHeader : "webhook-timestamp"} header`}
                      htmlFor="webhook-received-ts"
                    >
                      <CodeInput
                        id="webhook-received-ts"
                        value={receivedTimestamp}
                        onChange={(e) => setReceivedTimestamp(e.target.value)}
                        inputMode="numeric"
                      />
                    </Field>
                  )}
                  {withId && (
                    <Field label={`${scheme === "custom" ? custom.idHeader : "webhook-id"} header`} htmlFor="webhook-received-id">
                      <CodeInput id="webhook-received-id" value={receivedId} onChange={(e) => setReceivedId(e.target.value)} />
                    </Field>
                  )}
                  {verified &&
                    (!verified.ok ? (
                      <p className="text-sm text-[color:var(--text-muted)]">{verified.error}</p>
                    ) : (
                      <div
                        role="status"
                        className={`rounded-md border p-3 text-sm ${verified.valid ? "border-[color:var(--accent)]" : "border-[color:var(--error)]"}`}
                      >
                        <p className={`font-semibold ${verified.valid ? "text-[color:var(--accent-text)]" : "text-[color:var(--error)]"}`}>
                          {verified.valid ? "Signature matches" : "Signature doesn’t match"}
                        </p>
                        {verified.note && <p className="mt-1">{verified.note}</p>}
                        {!verified.valid && (
                          <p className="mt-2 break-all text-[color:var(--text-muted)]">
                            Expected <code className="font-[family-name:var(--font-mono)]">{verified.expected}</code>
                          </p>
                        )}
                      </div>
                    ))}
                </>
              )}
            </div>
          ) : null}
        </div>
      </OutputPanel>
    </>
  );
}

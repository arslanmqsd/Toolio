"use client";

import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { ArrowDownAZ, Plus, X } from "lucide-react";
import ExamplePicker from "@/components/tool-shell/ExamplePicker";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { CopyButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import ValueTable from "@/components/ui/ValueTable";
import { createParam, occurrences, sortParams, updateParam, type QueryParam } from "@/lib/tools/developer/query-params";
import {
  buildUrl,
  draftFrom,
  normalizeUrl,
  parseUrl,
  resolveUrl,
  safeDecode,
  type ParsedUrl,
  type UrlDraft,
  type UrlType,
} from "@/lib/tools/developer/url-parser";

const EXAMPLE = "https://api.example.com:8443/users/123?include=profile&sort=desc#details";

const EXAMPLES = [
  { id: "api", label: "API", url: "https://api.example.com/v2/users/123/orders?status=shipped&limit=50&page=2" },
  {
    id: "oauth",
    label: "OAuth callback",
    url: "https://app.example.com/auth/callback?code=4%2F0AX4XfWh&state=xyz%3D%3D&scope=openid%20email%20profile&redirect_uri=https%3A%2F%2Fapp.example.com%2Fhome%3Ftab%3Dnew",
  },
  {
    id: "tracking",
    label: "Tracking",
    url: "https://shop.example.com/sale?utm_source=newsletter&utm_medium=email&utm_campaign=spring+sale&tag=shoes&tag=bags&ref=",
  },
  { id: "credentials", label: "Credentials", url: "https://admin:s3cr3t%21@db.example.com:5432/reports?format=csv" },
  { id: "relative", label: "Relative", url: "../api/users?page=2&q=caf%C3%A9#results" },
] as const;

const TYPE_LABELS: Record<UrlType, string> = {
  absolute: "Absolute URL",
  relative: "Relative URL",
  "protocol-relative": "Protocol-relative URL",
};

const SCHEME_DANGER: Record<string, string> = {
  "javascript:": "javascript: URLs run code when opened.",
  "vbscript:": "vbscript: URLs run code when opened.",
  "data:": "data: URLs can carry a whole page or script inside them.",
  "file:": "file: URLs point at files on someone's computer.",
};

const MAX_PARAMS_SHOWN = 500;

// The output panel sets a monospace font for values; explanations read better in the UI font.
const helpClass = "font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]";

type Field = "scheme" | "username" | "password" | "hostname" | "port" | "pathname" | "hash";

const FIELDS: { field: Field; label: string; types: UrlType[] }[] = [
  { field: "scheme", label: "Protocol", types: ["absolute"] },
  { field: "username", label: "Username", types: ["absolute", "protocol-relative"] },
  { field: "password", label: "Password", types: ["absolute", "protocol-relative"] },
  { field: "hostname", label: "Hostname", types: ["absolute", "protocol-relative"] },
  { field: "port", label: "Port", types: ["absolute", "protocol-relative"] },
  { field: "pathname", label: "Path", types: ["absolute", "protocol-relative", "relative"] },
  { field: "hash", label: "Fragment", types: ["absolute", "protocol-relative", "relative"] },
];

const isExample = (text: string) => [EXAMPLE, ...EXAMPLES.map((e) => e.url)].includes(text.trim());

/** "example.com/path" or "localhost:3000" pasted without a scheme. */
function missingScheme(url: ParsedUrl): boolean {
  if (url.type === "relative") return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]|$)/i.test(url.input);
  return url.opaque && (url.protocol === "localhost:" || url.protocol.includes("."));
}

/** The decoded form under a field, only when it differs from what's written. */
function DecodedNote({ raw }: { raw: string }) {
  const decoded = safeDecode(raw);
  if (decoded === raw) return null;
  return (
    <p className="mt-1 break-all text-xs text-[color:var(--text-muted)]">
      <span className="font-[family-name:var(--font-ui)]">Decoded: </span>
      {decoded}
    </p>
  );
}

const rowClass = "border-t border-[color:var(--border)] max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:py-2";
const rowHeaderClass =
  "py-2 pl-1 pr-4 text-left align-top font-[family-name:var(--font-ui)] text-sm font-normal text-[color:var(--text-muted)] max-sm:col-span-2 max-sm:py-1 sm:w-28 sm:pt-3.5";

function ComponentsTable({ draft, url, onChange }: { draft: UrlDraft; url: ParsedUrl | null; onChange: (draft: UrlDraft) => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const fields = FIELDS.filter((f) => f.types.includes(draft.type));
  const query = url?.search ?? "";
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">URL components</caption>
      <tbody>
        {fields.map(({ field, label }) => {
          const secret = field === "password" && !showPassword;
          return (
            <tr key={field} className={rowClass}>
              <th scope="row" className={rowHeaderClass}>
                {label}
                {field === "password" && draft.password && (
                  <span className="ml-1 font-medium text-[color:var(--accent-warn-text)]">(sensitive)</span>
                )}
              </th>
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-2">
                  <CodeInput
                    aria-label={label}
                    type={secret ? "password" : "text"}
                    autoComplete="off"
                    spellCheck={false}
                    inputMode={field === "port" ? "numeric" : undefined}
                    value={draft[field]}
                    placeholder={field === "port" ? "default" : field === "pathname" ? "/" : undefined}
                    onChange={(e) => onChange({ ...draft, [field]: e.target.value })}
                  />
                  {field === "password" && draft.password && (
                    <Button size="sm" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? "Hide" : "Show"}
                    </Button>
                  )}
                </div>
                {(field === "username" || field === "pathname" || field === "hash" || (field === "password" && showPassword)) && (
                  <DecodedNote raw={draft[field]} />
                )}
                {field === "hostname" && draft.hostname.includes("xn--") && (
                  <p className={`mt-1 ${helpClass}`}>Punycode, the form browsers use for international domain names.</p>
                )}
              </td>
              <td className="w-px whitespace-nowrap py-2 pr-1 text-right align-top text-xs max-sm:row-start-2 max-sm:col-start-2 sm:pt-3">
                <CopyButton text={draft[field] || undefined} />
              </td>
            </tr>
          );
        })}
        {url?.origin && (
          <ReadOnlyRow label="Origin" value={url.origin} />
        )}
        {query && <ReadOnlyRow label="Query" value={query} />}
      </tbody>
    </table>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className={rowClass}>
      <th scope="row" className={`${rowHeaderClass} sm:!pt-2`}>
        {label}
      </th>
      <td className="break-all py-2 pr-2">{value}</td>
      <td className="w-px whitespace-nowrap py-2 pr-1 text-right align-top text-xs">
        <CopyButton text={value} />
      </td>
    </tr>
  );
}

function PathSegments({ segments, pathname }: { segments: string[]; pathname: string }) {
  if (segments.length === 0) return null;
  return (
    <section aria-labelledby="url-path-segments" className="space-y-2">
      <h3 id="url-path-segments" className="font-[family-name:var(--font-ui)] text-sm font-semibold">
        Path segments <span className="font-normal text-[color:var(--text-muted)]">({segments.length})</span>
      </h3>
      <p className="break-all text-xs text-[color:var(--text-muted)]">{pathname}</p>
      <ol className="divide-y divide-[color:var(--border)] rounded-md border border-[color:var(--border)] text-sm">
        {segments.map((segment, i) => (
          <li key={i} className="flex items-start gap-3 px-3 py-1.5">
            <span className="w-6 shrink-0 pt-0.5 text-right text-xs tabular-nums text-[color:var(--text-muted)]">{i + 1}</span>
            <div className="min-w-0 flex-1 break-all">
              {segment === "" ? <em className="text-[color:var(--text-muted)]">(empty)</em> : segment}
              <DecodedNote raw={segment} />
            </div>
            <span className="text-xs">
              <CopyButton text={safeDecode(segment) || undefined} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function QueryTable({ params, onChange }: { params: QueryParam[]; onChange?: (params: QueryParam[]) => void }) {
  const headingId = useId();
  const sortHelpId = useId();
  const counts = useMemo(() => occurrences(params), [params]);
  const shown = params.slice(0, MAX_PARAMS_SHOWN);
  const edit = (i: number, change: { key?: string; value?: string }) =>
    onChange?.(params.map((p, j) => (j === i ? updateParam(p, change) : p)));
  const name = (p: QueryParam, i: number) => `${p.key || "(no name)"}${counts[i] ? ` (${counts[i]!.n} of ${counts[i]!.of})` : ""}`;

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="font-[family-name:var(--font-ui)] text-sm font-semibold">
        Query parameters <span className="font-normal text-[color:var(--text-muted)]">({params.length.toLocaleString()})</span>
      </h3>
      {params.length > 0 && (
        <table className="w-full text-sm">
          <thead className="max-sm:sr-only">
            <tr className="text-left font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
              <th scope="col" className="py-1.5 pr-3 font-medium">Parameter</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Raw value</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Decoded value</th>
              <th scope="col" className="py-1.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={i} className="border-t border-[color:var(--border)] align-top max-sm:block max-sm:space-y-1.5 max-sm:py-3">
                <td className="py-1.5 pr-3 max-sm:block sm:w-1/4">
                  <MobileLabel>Parameter</MobileLabel>
                  {onChange ? (
                    <CodeInput aria-label={`Name of parameter ${i + 1}`} spellCheck={false} value={p.key} onChange={(e) => edit(i, { key: e.target.value })} />
                  ) : (
                    <span className="break-all text-[color:var(--accent-text)]">{p.key}</span>
                  )}
                  {counts[i] && (
                    <span className="mt-1 block font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                      Repeated: {counts[i]!.n} of {counts[i]!.of}
                    </span>
                  )}
                </td>
                <td className="break-all py-1.5 pr-3 max-sm:block sm:w-1/4 sm:pt-3">
                  <MobileLabel>Raw value</MobileLabel>
                  {p.hasEquals ? (
                    p.rawValue || <em className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">(empty)</em>
                  ) : (
                    <em className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">(no value)</em>
                  )}
                </td>
                <td className="py-1.5 pr-3 max-sm:block">
                  <MobileLabel>Decoded value</MobileLabel>
                  {onChange ? (
                    <CodeInput aria-label={`Value of ${name(p, i)}`} spellCheck={false} value={p.value} onChange={(e) => edit(i, { value: e.target.value })} />
                  ) : (
                    <span className="break-all">{p.value}</span>
                  )}
                </td>
                <td className="w-px whitespace-nowrap py-1.5 text-right text-xs max-sm:block max-sm:w-auto max-sm:text-left">
                  <span className="inline-flex items-center gap-2">
                    <CopyButton text={p.value || undefined} />
                    {onChange && (
                      <button
                        type="button"
                        onClick={() => onChange(params.filter((_, j) => j !== i))}
                        aria-label={`Remove ${name(p, i)}`}
                        className="rounded p-1 text-[color:var(--text-muted)] hover:text-[color:var(--error)]"
                      >
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {params.length > MAX_PARAMS_SHOWN && (
        <p className={helpClass}>
          Showing the first {MAX_PARAMS_SHOWN} of {params.length.toLocaleString()} parameters.
        </p>
      )}
      {params.length > 0 && (
        <p className={helpClass}>Decoded the way servers read query strings, so + is a space.</p>
      )}
      {onChange && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" icon={Plus} onClick={() => onChange([...params, createParam()])}>
            Add parameter
          </Button>
          {params.length > 1 && (
            <>
              <Button size="sm" icon={ArrowDownAZ} onClick={() => onChange(sortParams(params))} aria-describedby={sortHelpId}>
                Sort by name
              </Button>
              <span id={sortHelpId} className={helpClass}>
                Sorting changes parameter order, which some servers depend on.
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function MobileLabel({ children }: { children: string }) {
  return <span className="mb-0.5 block font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)] sm:hidden">{children}</span>;
}

function Normalize({ url, onUse }: { url: ParsedUrl; onUse: (href: string) => void }) {
  const normalized = normalizeUrl(url);
  if (normalized === null) return null;
  const same = normalized === url.input;
  return (
    <section aria-labelledby="url-normalize" className="space-y-2">
      <h3 id="url-normalize" className="font-[family-name:var(--font-ui)] text-sm font-semibold">
        Normalized
      </h3>
      <p className={helpClass}>
        The form browsers read: scheme and host lowercased, default port dropped, . and .. segments resolved, and characters
        that must be escaped percent-encoded. The query&apos;s order and values are left as written.
      </p>
      {same ? (
        <p className="font-[family-name:var(--font-ui)] text-sm">Already normalized.</p>
      ) : (
        <>
          <p className="break-all rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">{normalized}</p>
          <div className="flex items-center gap-2 text-xs">
            <Button size="sm" onClick={() => onUse(normalized)}>
              Use normalized URL
            </Button>
            <CopyButton text={normalized} />
          </div>
        </>
      )}
    </section>
  );
}

export default function UrlParser() {
  const [text, setText] = useToolInput(EXAMPLE);
  // Set by edits to the parts below; ignored once the input changes some other way.
  const [edit, setEdit] = useState<{ draft: UrlDraft; built: string } | null>(null);
  const [base, setBase] = useState("https://example.com/app/");

  // Typing stays responsive on very long URLs.
  const deferredText = useDeferredValue(text);
  const result = useMemo(() => parseUrl(deferredText), [deferredText]);
  const url = result.ok ? result.url : null;
  const draft = edit && edit.built === text ? edit.draft : url && draftFrom(url);
  const empty = deferredText.trim() === "";

  const resolved = useMemo(() => (url && url.type !== "absolute" ? resolveUrl(url.input, base) : null), [url, base]);
  // Rebuilding from parts writes them the way browsers read them, which can differ from the input.
  const rebuildDiffers = !edit && url && !url.opaque && buildUrl(draftFrom(url)!) !== url.input;

  function applyDraft(next: UrlDraft) {
    const built = buildUrl(next);
    setEdit({ draft: next, built });
    setText(built);
  }

  const badges = url
    ? [
        url.opaque ? `${url.protocol} URL` : TYPE_LABELS[url.type],
        url.username || url.password ? "With credentials" : null,
        url.searchParams.length > 0 ? "With query parameters" : null,
        url.hash ? "With fragment" : null,
      ].filter((b): b is string => b !== null)
    : [];

  return (
    <>
      <InputPanel label="URL" wide>
        <div className="space-y-4">
          <CodeTextArea
            aria-label="URL to parse"
            aria-describedby="url-status"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            spellCheck={false}
            invalid={!result.ok && !empty}
            placeholder="https://example.com/path?query=value#fragment"
          />

          <div id="url-status" role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {empty ? (
              <span className="text-[color:var(--text-muted)]">Paste a URL to break it into its parts.</span>
            ) : url ? (
              <>
                <span className="font-medium text-[color:var(--accent-text)]">✓ Valid URL</span>
                {badges.map((badge) => (
                  <span key={badge} className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs">
                    {badge}
                  </span>
                ))}
              </>
            ) : (
              <span className="text-[color:var(--error)]">
                <span className="font-medium">✕ Invalid URL:</span> {!result.ok && result.error}
              </span>
            )}
            <span className="ml-auto text-xs text-[color:var(--text-muted)]">Parsed locally in your browser.</span>
          </div>

          {url && missingScheme(url) && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              This looks like a web address without its scheme.
              <Button size="sm" onClick={() => setText(`https://${url.input}`)}>
                Add https://
              </Button>
            </p>
          )}
          {url?.dangerous && (
            <Alert tone="warn" title={`Potentially dangerous ${url.protocol} URL`}>
              <p>{SCHEME_DANGER[url.protocol]} Toolio only shows it as text and never opens it.</p>
            </Alert>
          )}
          {url && (url.username || url.password) && (
            <Alert tone="warn" title={url.password ? "This URL contains a password" : "This URL contains a username"}>
              <p>
                Credentials in URLs end up in logs, browser history and Referer headers.
                {url.password && " The password is hidden below until you choose to show it."}
              </p>
            </Alert>
          )}

          {url && url.type !== "absolute" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="url-base">
                Resolve against base URL
              </label>
              <CodeInput id="url-base" value={base} onChange={(e) => setBase(e.target.value)} spellCheck={false} />
              {resolved &&
                (resolved.ok ? (
                  <p className="flex items-start gap-2 break-all text-sm">
                    <span className="shrink-0 font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">Resolved:</span>
                    <span className="min-w-0 flex-1">{resolved.resolved}</span>
                    <span className="text-xs">
                      <CopyButton text={resolved.resolved} />
                    </span>
                  </p>
                ) : (
                  <p role="alert" className="text-xs text-[color:var(--error)]">
                    {resolved.error}
                  </p>
                ))}
            </div>
          )}

          <ExamplePicker examples={EXAMPLES} hasUserInput={() => text.trim() !== "" && !isExample(text)} onLoad={(example) => setText(example.url)} />

          <p className={helpClass}>
            To encode or decode text for a URL, use the{" "}
            <Link href="/tools/developer/url-encoder" className="text-[color:var(--accent-text)] underline">
              URL Encoder
            </Link>
            .
          </p>
        </div>
      </InputPanel>

      <OutputPanel label="Parts" copyText={url ? url.input : undefined} outputType="url" wide>
        {empty ? (
          <Alert title="Nothing to parse" tone="warn">
            <p>Paste a URL into the input.</p>
            <Button size="sm" onClick={() => setText(EXAMPLE)} className="mt-3">
              Load example
            </Button>
          </Alert>
        ) : !draft && !url ? (
          <Alert title="Invalid URL">
            <p>{!result.ok && result.error}</p>
          </Alert>
        ) : (
          <div className="space-y-6">
            {draft ? (
              <section aria-labelledby="url-components" className="space-y-2">
                <h3 id="url-components" className="font-[family-name:var(--font-ui)] text-sm font-semibold">
                  Components
                </h3>
                <p className={helpClass}>
                  Edit any part to rebuild the URL in the input.
                  {rebuildDiffers && " Editing also writes the other parts the way browsers read them, for example a lowercase host."}
                </p>
                <ComponentsTable draft={draft} url={url} onChange={applyDraft} />
              </section>
            ) : (
              url && (
                <ValueTable
                  rows={[
                    { label: "Scheme", value: url.protocol },
                    { label: "Value", value: url.pathname, note: safeDecode(url.pathname) !== url.pathname ? `Decoded: ${safeDecode(url.pathname)}` : undefined },
                    ...(url.search ? [{ label: "Query", value: url.search }] : []),
                    ...(url.hash ? [{ label: "Fragment", value: url.hash, note: `Decoded: ${safeDecode(url.hash)}` }] : []),
                  ]}
                />
              )
            )}
            {url && <PathSegments segments={url.pathSegments} pathname={url.pathname} />}
            {draft ? (
              <QueryTable params={draft.params} onChange={(params) => applyDraft({ ...draft, params })} />
            ) : (
              url && url.searchParams.length > 0 && <QueryTable params={url.searchParams} />
            )}
            {url && !url.opaque && <Normalize url={url} onUse={setText} />}
          </div>
        )}
      </OutputPanel>
    </>
  );
}

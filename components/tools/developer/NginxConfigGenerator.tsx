"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import CodeBlock from "@/components/ui/CodeBlock";
import { CodeInput } from "@/components/ui/CodeField";
import Dialog from "@/components/ui/Dialog";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import { generateFull, generateSite, siteFileName } from "@/lib/tools/developer/nginx/generate";
import { sequentialIds, usesUpstream, type NginxConfig } from "@/lib/tools/developer/nginx/model";
import { LOCATION_PRESETS, TEMPLATES } from "@/lib/tools/developer/nginx/templates";
import { validateConfig, type ConfigField } from "@/lib/tools/developer/nginx/validate";
import IssueList, { IssueIcon } from "./nginx/IssueList";
import LocationEditor from "./nginx/LocationEditor";
import UpstreamEditor from "./nginx/UpstreamEditor";

const DEFAULT_TEMPLATE = TEMPLATES[0];

const OUTPUTS = [
  { id: "site", label: "Site file (conf.d)" },
  { id: "full", label: "Full nginx.conf" },
] as const;

type Output = (typeof OUTPUTS)[number]["id"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-4 border-t border-[color:var(--border)] pt-5">
      <legend className="pr-2 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function NginxConfigGenerator() {
  // The same ids on the server and in the browser, so the first render matches.
  const [config, setConfig] = useState<NginxConfig>(() => DEFAULT_TEMPLATE.create(sequentialIds("init")));
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE.id);
  const [loaded, setLoaded] = useState(DEFAULT_TEMPLATE.id);
  const [pending, setPending] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [presetId, setPresetId] = useState(LOCATION_PRESETS[0].id);
  const [output, setOutput] = useState<Output>("site");
  const counter = useRef(0);
  // Ids for things added in the browser; they never need to match a server render.
  const makeId = useRef(() => `n-${++counter.current}`).current;

  const issues = useMemo(() => validateConfig(config), [config]);
  const text = useMemo(() => (output === "full" ? generateFull(config) : generateSite(config)), [config, output]);
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  const notes = issues.length - errors - warnings;
  const proxying = config.locations.some((l) => l.kind === "proxy");
  const template = TEMPLATES.find((t) => t.id === loaded);

  function update(patch: Partial<NginxConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
    setDirty(true);
  }

  const fieldIssues = (field: ConfigField) => issues.filter((i) => i.field === field);
  /** Props wiring a text field to its messages: the error border and aria-describedby. */
  function wire(field: ConfigField) {
    const own = fieldIssues(field);
    return { invalid: own.some((i) => i.level === "error"), "aria-describedby": own.length ? `nginx-${field}-issues` : undefined };
  }
  const issuesFor = (field: ConfigField) => <IssueList id={`nginx-${field}-issues`} issues={fieldIssues(field)} />;

  function textField(field: keyof NginxConfig & ConfigField, label: string, opts: { help?: ReactNode; placeholder?: string; issueField?: ConfigField } = {}) {
    const issueField = opts.issueField ?? field;
    return (
      <Field label={label} htmlFor={`nginx-${field}`} help={opts.help}>
        <CodeInput id={`nginx-${field}`} value={config[field] as string} onChange={(e) => update({ [field]: e.target.value })} placeholder={opts.placeholder} {...wire(issueField)} />
        {!opts.issueField && issuesFor(field)}
      </Field>
    );
  }

  function load(id: string) {
    const t = TEMPLATES.find((x) => x.id === id) ?? DEFAULT_TEMPLATE;
    setConfig(t.create(makeId));
    setTemplateId(t.id);
    setLoaded(t.id);
    setDirty(false);
    setPending(null);
  }

  function requestLoad(id: string) {
    if (dirty) setPending(id);
    else load(id);
  }

  function moveLocation(index: number, by: -1 | 1) {
    const next = [...config.locations];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    update({ locations: next });
  }

  function addLocation() {
    const preset = LOCATION_PRESETS.find((p) => p.id === presetId) ?? LOCATION_PRESETS[0];
    const location = preset.create(makeId);
    update({ locations: [...config.locations, location] });
    requestAnimationFrame(() => document.getElementById(`loc-${location.id}-path`)?.focus());
  }

  const timeoutIssues = fieldIssues("timeouts");

  return (
    <>
      <InputPanel label="Configuration">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Start from" htmlFor="nginx-template">
              <Select id="nginx-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => requestLoad(templateId)}>Load template</Button>
              <Button onClick={() => requestLoad(DEFAULT_TEMPLATE.id)} disabled={!dirty && loaded === DEFAULT_TEMPLATE.id}>
                Reset
              </Button>
            </div>
          </div>
          {template && !dirty && <p className="-mt-2 text-xs text-[color:var(--text-muted)]">{template.description}</p>}

          <Section title="Server">
            {textField("serverNames", "Domain names", { help: "Separated by spaces. *.example.com covers subdomains; _ catches any host.", placeholder: "example.com www.example.com" })}
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
              {textField("httpPort", "HTTP port", { placeholder: "80" })}
              <Checkbox checked={config.ipv6} onChange={(ipv6) => update({ ipv6 })}>
                Listen on IPv6 too
              </Checkbox>
            </div>
          </Section>

          <Section title="HTTPS">
            <Checkbox checked={config.https} onChange={(https) => update({ https })}>
              Serve over HTTPS
            </Checkbox>
            {config.https && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField("certificate", "Certificate", { help: "The full chain: Let's Encrypt's fullchain.pem.", placeholder: "/etc/letsencrypt/live/example.com/fullchain.pem" })}
                  {textField("certificateKey", "Private key", { help: "Readable by nginx's master process only.", placeholder: "/etc/letsencrypt/live/example.com/privkey.pem" })}
                </div>
                {textField("httpsPort", "HTTPS port", { placeholder: "443" })}
                <div className="space-y-2">
                  <Checkbox checked={config.redirectToHttps} onChange={(redirectToHttps) => update({ redirectToHttps })}>
                    Redirect HTTP to HTTPS
                  </Checkbox>
                  <Checkbox checked={config.http2} onChange={(http2) => update({ http2 })}>
                    HTTP/2
                  </Checkbox>
                  {config.http2 && (
                    <Checkbox checked={config.legacyHttp2} onChange={(legacyHttp2) => update({ legacyHttp2 })}>
                      nginx older than 1.25.1 (writes listen … http2 instead of http2 on)
                    </Checkbox>
                  )}
                  <Checkbox checked={config.hsts} onChange={(hsts) => update({ hsts })}>
                    HSTS: tell browsers to always use HTTPS
                  </Checkbox>
                  {config.hsts && (
                    <div className="space-y-2 pl-6">
                      <Checkbox checked={config.hstsSubdomains} onChange={(hstsSubdomains) => update({ hstsSubdomains })}>
                        Include subdomains
                      </Checkbox>
                      <Checkbox checked={config.hstsPreload} onChange={(hstsPreload) => update({ hstsPreload })}>
                        Preload
                      </Checkbox>
                    </div>
                  )}
                </div>
                {issuesFor("hsts")}
              </>
            )}
          </Section>

          <Section title="Files">
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("root", "Document root", { help: "The folder static files are served from.", placeholder: "/var/www/example.com" })}
              {textField("index", "Index files", { help: "Tried in order for a folder. Separated by spaces.", placeholder: "index.html" })}
            </div>
          </Section>

          <Section title="Locations">
            <p className="text-xs text-[color:var(--text-muted)]">
              nginx picks an exact match first, then the longest prefix, then the first regex that matches in this order. Order matters for regexes only.
            </p>
            {config.locations.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)]">No locations yet: every request is served from the document root.</p>
            ) : (
              <ol className="space-y-3">
                {config.locations.map((l, i) => (
                  <li key={l.id}>
                    <LocationEditor
                      location={l}
                      index={i}
                      count={config.locations.length}
                      upstreamName={config.upstreamName}
                      rateLimitOn={config.rateLimit}
                      issues={issues.filter((x) => x.locationId === l.id)}
                      onChange={(next) => update({ locations: config.locations.map((x) => (x.id === l.id ? next : x)) })}
                      onMove={(by) => moveLocation(i, by)}
                      onRemove={() => update({ locations: config.locations.filter((x) => x.id !== l.id) })}
                    />
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Add a location" htmlFor="nginx-location-preset">
                <Select id="nginx-location-preset" value={presetId} onChange={(e) => setPresetId(e.target.value)} className="w-60">
                  {LOCATION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button icon={Plus} onClick={addLocation}>
                Add location
              </Button>
            </div>
          </Section>

          {usesUpstream(config) && (
            <Section title="Upstream servers">
              <div className="grid gap-4 sm:grid-cols-2">
                {textField("upstreamName", "Group name", { help: "Used as proxy_pass http://name.", placeholder: "app" })}
                {textField("upstreamKeepalive", "Keep idle connections", { help: "Reuses connections to the servers. Blank for none; 16–64 is typical.", placeholder: "32" })}
              </div>
              <p className="text-xs text-[color:var(--text-muted)]">Requests go round the servers in turn, more often to higher weights; backups only get requests when the others are down.</p>
              <UpstreamEditor servers={config.upstreamServers} issues={issues} makeId={makeId} onChange={(upstreamServers) => update({ upstreamServers })} />
            </Section>
          )}

          <Section title="Limits and performance">
            <Checkbox checked={config.gzip} onChange={(gzip) => update({ gzip })}>
              Compress text responses with gzip
            </Checkbox>
            {textField("clientMaxBodySize", "Largest request body", { help: "Uploads bigger than this get 413. nginx's default is 1m.", placeholder: "1m" })}
            {proxying && (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["proxyConnectTimeout", "Connect timeout", "60s"],
                      ["proxySendTimeout", "Send timeout", "60s"],
                      ["proxyReadTimeout", "Read timeout", "60s"],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <Field key={key} label={label} htmlFor={`nginx-${key}`}>
                      <CodeInput id={`nginx-${key}`} value={config[key]} onChange={(e) => update({ [key]: e.target.value })} placeholder={placeholder} {...wire("timeouts")} />
                    </Field>
                  ))}
                </div>
                <p className="text-xs text-[color:var(--text-muted)]">How long to wait for the app server. Read timeout is the time between two chunks of the response, not the whole response.</p>
                <IssueList id="nginx-timeouts-issues" issues={timeoutIssues} />
              </div>
            )}
          </Section>

          <Section title="Logs">
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("accessLog", "Access log", { help: "A path, or off.", placeholder: "/var/log/nginx/access.log" })}
              {textField("errorLog", "Error log", { help: "A path. Blank uses the main nginx.conf's.", placeholder: "/var/log/nginx/error.log" })}
            </div>
          </Section>

          <Section title="Security">
            <div className="space-y-2">
              <Checkbox checked={config.securityHeaders} onChange={(securityHeaders) => update({ securityHeaders })}>
                Security headers (nosniff, same-origin frames, referrer policy)
              </Checkbox>
              <Checkbox checked={config.hideVersion} onChange={(hideVersion) => update({ hideVersion })}>
                Hide the nginx version (server_tokens off)
              </Checkbox>
              <Checkbox checked={config.rateLimit} onChange={(rateLimit) => update({ rateLimit })}>
                Rate limiting per client IP
              </Checkbox>
            </div>
            {config.rateLimit && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Rate" htmlFor="nginx-rate" help="Steady requests per second (r/s) or minute (r/m).">
                    <CodeInput id="nginx-rate" value={config.rateLimitRate} onChange={(e) => update({ rateLimitRate: e.target.value })} placeholder="10r/s" {...wire("rateLimit")} />
                  </Field>
                  <Field label="Burst" htmlFor="nginx-burst" help="Extra requests allowed at once; beyond that, clients get 429.">
                    <CodeInput id="nginx-burst" value={config.rateLimitBurst} onChange={(e) => update({ rateLimitBurst: e.target.value })} placeholder="20" {...wire("rateLimit")} />
                  </Field>
                </div>
                <p className="text-xs text-[color:var(--text-muted)]">Choose which locations to limit in their settings above.</p>
                {issuesFor("rateLimit")}
              </>
            )}
          </Section>
        </div>
      </InputPanel>

      <OutputPanel
        label={output === "full" ? "nginx.conf" : siteFileName(config)}
        copyText={text}
        download={{ filename: output === "full" ? "nginx.conf" : siteFileName(config), mimeType: "text/plain" }}
      >
        <div className="space-y-5">
          <section aria-labelledby="nginx-checks" className="font-[family-name:var(--font-ui)]">
            <h2 id="nginx-checks" className="mb-1 flex items-center gap-2 text-sm font-semibold">
              {errors + warnings === 0 ? (
                <>
                  <CheckCircle2 aria-hidden className="h-4 w-4 text-[color:var(--accent-text)]" /> Local checks passed
                </>
              ) : (
                <>
                  <IssueIcon level={errors ? "error" : "warning"} className="h-4 w-4" />
                  {[errors && `${errors} ${errors === 1 ? "error" : "errors"}`, warnings && `${warnings} ${warnings === 1 ? "warning" : "warnings"}`].filter(Boolean).join(", ")}
                </>
              )}
              {notes > 0 && <span className="font-normal text-[color:var(--text-muted)]">· {notes === 1 ? "1 note" : `${notes} notes`}</span>}
            </h2>
            <p className="mb-2 text-xs text-[color:var(--text-muted)]">
              Checked in your browser, which can&rsquo;t see your server: it isn&rsquo;t <code className="font-[family-name:var(--font-mono)]">nginx -t</code>, and doesn&rsquo;t check that
              certificates or folders exist. Run <code className="font-[family-name:var(--font-mono)]">sudo nginx -t</code> before{" "}
              <code className="font-[family-name:var(--font-mono)]">sudo nginx -s reload</code>.
            </p>
            <IssueList issues={issues} />
          </section>

          <SegmentedControl label="File" options={OUTPUTS} value={output} onChange={setOutput} />
          <p className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
            {output === "site"
              ? `For /etc/nginx/conf.d/${siteFileName(config)} (or sites-available/ on Debian and Ubuntu), which nginx.conf includes inside http {}.`
              : "Replaces /etc/nginx/nginx.conf entirely. Back up the old one first: it may hold settings this doesn't, like the user nginx runs as."}
          </p>
          <CodeBlock code={text} />
        </div>
      </OutputPanel>

      <Dialog open={pending !== null} onClose={() => setPending(null)} title="Replace your configuration?" description="Loading a template replaces everything you've changed.">
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setPending(null)}>Keep editing</Button>
          <Button variant="primary" onClick={() => pending && load(pending)}>
            Replace
          </Button>
        </div>
      </Dialog>
    </>
  );
}


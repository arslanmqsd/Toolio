"use client";

import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import Select from "@/components/ui/Select";
import type { CacheRule, Location, LocationKind, LocationMatch, RedirectCode } from "@/lib/tools/developer/nginx/model";
import { locationLabel, type Issue } from "@/lib/tools/developer/nginx/validate";
import IssueList from "./IssueList";

const MATCHES: { id: LocationMatch; label: string }[] = [
  { id: "prefix", label: "Starts with (prefix)" },
  { id: "exact", label: "Exactly (=)" },
  { id: "preferred", label: "Starts with, skip regexes (^~)" },
  { id: "regex", label: "Regex, case-sensitive (~)" },
  { id: "regexCaseless", label: "Regex, any case (~*)" },
];

const KINDS: { id: LocationKind; label: string }[] = [
  { id: "static", label: "Serve files" },
  { id: "spa", label: "Serve files, fall back to index.html (SPA)" },
  { id: "proxy", label: "Proxy to an app server" },
  { id: "redirect", label: "Redirect" },
  { id: "deny", label: "Block (403)" },
];

const CACHE: { id: CacheRule; label: string }[] = [
  { id: "none", label: "No Cache-Control header" },
  { id: "immutable", label: "A year, immutable (hashed file names)" },
  { id: "short", label: "An hour" },
  { id: "noStore", label: "Never cache (no-store)" },
];

const MATCH_HELP: Record<LocationMatch, string> = {
  prefix: "Matches any path starting with this. The longest matching prefix wins, unless a regex matches.",
  exact: "Only this exact path. Checked first, and the fastest.",
  preferred: "Like a prefix, but when it's the longest match nginx skips the regexes.",
  regex: "A PCRE regular expression. Regexes are tried in order; the first match wins.",
  regexCaseless: "A PCRE regular expression, ignoring case. Regexes are tried in order; the first match wins.",
};

interface LocationEditorProps {
  location: Location;
  index: number;
  count: number;
  upstreamName: string;
  rateLimitOn: boolean;
  issues: Issue[];
  onChange: (location: Location) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

export default function LocationEditor({ location: l, index, count, upstreamName, rateLimitOn, issues, onChange, onMove, onRemove }: LocationEditorProps) {
  const set = <K extends keyof Location>(key: K, value: Location[K]) => onChange({ ...l, [key]: value });
  const id = (name: string) => `loc-${l.id}-${name}`;
  const errors = issues.filter((i) => i.level === "error").length;
  const isRegex = l.match === "regex" || l.match === "regexCaseless";
  const toUpstream = l.proxyTarget === "upstream";

  return (
    <details open className="group rounded-md border border-[color:var(--border)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 -rotate-90 text-[color:var(--text-muted)] transition-transform group-open:rotate-0" />
        <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-sm">{locationLabel(l)}</span>
        {errors > 0 && <span className="text-xs text-[color:var(--error)]">{errors === 1 ? "1 error" : `${errors} errors`}</span>}
      </summary>
      <div className="space-y-4 border-t border-[color:var(--border)] p-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Match" htmlFor={id("match")} help={MATCH_HELP[l.match]}>
            <Select id={id("match")} value={l.match} onChange={(e) => set("match", e.target.value as LocationMatch)}>
              {MATCHES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={isRegex ? "Pattern" : "Path"} htmlFor={id("path")}>
            <CodeInput id={id("path")} value={l.path} onChange={(e) => set("path", e.target.value)} placeholder={isRegex ? "\\.(css|js)$" : "/api/"} />
          </Field>
        </div>

        <Field label="Then" htmlFor={id("kind")}>
          <Select id={id("kind")} value={l.kind} onChange={(e) => set("kind", e.target.value as LocationKind)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        {l.kind === "proxy" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Send to" htmlFor={id("target")}>
                <Select id={id("target")} value={toUpstream ? "upstream" : "url"} onChange={(e) => set("proxyTarget", e.target.value === "upstream" ? "upstream" : "http://127.0.0.1:3000")}>
                  <option value="upstream">The upstream group ({upstreamName.trim() || "unnamed"})</option>
                  <option value="url">A URL</option>
                </Select>
              </Field>
              {toUpstream ? (
                <Field label="Path after it" htmlFor={id("proxyPath")} help={`“/” strips the matched ${l.path.trim() || "path"} before passing the request on; blank passes the URL unchanged.`}>
                  <CodeInput id={id("proxyPath")} value={l.proxyPath} onChange={(e) => set("proxyPath", e.target.value)} placeholder="(none)" />
                </Field>
              ) : (
                <Field label="URL" htmlFor={id("url")} help="With a path, even “/”, nginx replaces the matched part of the URL with it.">
                  <CodeInput id={id("url")} value={l.proxyTarget} onChange={(e) => set("proxyTarget", e.target.value)} placeholder="http://127.0.0.1:3000" />
                </Field>
              )}
            </div>
            <div className="space-y-2">
              <Checkbox checked={l.forwardedHeaders} onChange={(v) => set("forwardedHeaders", v)}>
                Pass the original host, client IP and scheme (Host, X-Real-IP, X-Forwarded-*)
              </Checkbox>
              <Checkbox checked={l.websocket} onChange={(v) => set("websocket", v)}>
                Allow WebSocket connections (Upgrade)
              </Checkbox>
            </div>
          </div>
        )}

        {l.kind === "redirect" && (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Redirect to" htmlFor={id("redirect")} help="A full URL, or a path on this site.">
              <CodeInput id={id("redirect")} value={l.redirectTo} onChange={(e) => set("redirectTo", e.target.value)} placeholder="https://example.com/new" />
            </Field>
            <Field label="Status" htmlFor={id("code")}>
              <Select id={id("code")} value={l.redirectCode} onChange={(e) => set("redirectCode", e.target.value as RedirectCode)}>
                <option value="301">301 permanent</option>
                <option value="302">302 temporary</option>
                <option value="307">307 temporary, keeps method</option>
                <option value="308">308 permanent, keeps method</option>
              </Select>
            </Field>
          </div>
        )}

        {l.kind !== "redirect" && l.kind !== "deny" && (
          <Field label="Browser caching" htmlFor={id("cache")}>
            <Select id={id("cache")} value={l.cache} onChange={(e) => set("cache", e.target.value as CacheRule)}>
              {CACHE.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {(rateLimitOn || l.rateLimit) && (
          <Checkbox checked={l.rateLimit} onChange={(v) => set("rateLimit", v)}>
            Rate-limit requests to this location
          </Checkbox>
        )}

        <IssueList issues={issues} />

        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" icon={ArrowUp} onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${locationLabel(l)} up`}>
            Up
          </Button>
          <Button size="sm" icon={ArrowDown} onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${locationLabel(l)} down`}>
            Down
          </Button>
          <Button size="sm" icon={Trash2} onClick={onRemove} aria-label={`Remove ${locationLabel(l)}`}>
            Remove
          </Button>
        </div>
      </div>
    </details>
  );
}

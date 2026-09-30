"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ExternalLink } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import SearchInput from "@/components/ui/SearchInput";
import Section from "@/components/ui/Section";
import SegmentedControl from "@/components/ui/SegmentedControl";
import {
  STATUS_CLASSES,
  getStatus,
  searchStatuses,
  statusClass,
  type HttpStatus as Status,
  type StatusClassId,
} from "@/lib/tools/developer/http-status";

const LIST_ID = "http-status-list";
const optionId = (code: number) => `http-status-${code}`;

const FILTERS = [{ id: "all", label: "All" }, ...STATUS_CLASSES.map((c) => ({ id: String(c.id), label: c.label }))] as const;
type Filter = "all" | "1" | "2" | "3" | "4" | "5";

const EXAMPLES = ["404", "5xx", "rate limit", "redirect", "timeout"];

/** Colour per class: success reads as accent, client errors as warnings, server errors as errors. */
const CODE_TINT: Record<StatusClassId, string> = {
  1: "text-[color:var(--text-muted)]",
  2: "text-[color:var(--accent-text)]",
  3: "text-[color:var(--text-muted)]",
  4: "text-[color:var(--accent-warn-text)]",
  5: "text-[color:var(--error)]",
};

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-[color:var(--border)] px-1.5 py-0.5 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
      {children}
    </span>
  );
}

function StatusTags({ status }: { status: Status }) {
  return (
    <>
      {status.source && <Tag>{status.source} only</Tag>}
      {status.deprecated && <Tag>Deprecated</Tag>}
    </>
  );
}

function Details({ status }: { status: Status }) {
  const cls = STATUS_CLASSES[statusClass(status.code) - 1];
  return (
    <article className="space-y-6 font-[family-name:var(--font-ui)]" aria-labelledby="http-status-title">
      <header>
        <h2 id="http-status-title" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`font-[family-name:var(--font-mono)] text-4xl font-semibold ${CODE_TINT[cls.id]}`}>{status.code}</span>
          <span className="text-xl font-semibold">{status.name}</span>
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Tag>
            {cls.name} ({cls.label})
          </Tag>
          <StatusTags status={status} />
        </div>
        <p className="mt-4 text-base">{status.summary}</p>
      </header>

      <Section label="When you'll see it" as="h3">
        <p className="leading-relaxed">{status.seenWhen}</p>
      </Section>

      <Section label="What to do" as="h3">
        <p className="leading-relaxed">{status.whatToDo}</p>
      </Section>

      {status.headers && (
        <Section label="Related headers" as="h3">
          <ul className="flex flex-wrap gap-2">
            {status.headers.map((header) => (
              <li key={header}>
                <code className="rounded bg-[color:var(--surface-raised)] px-2 py-1 font-[family-name:var(--font-mono)] text-xs">{header}</code>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-[color:var(--border)] pt-4 text-sm">
        <dt className="text-[color:var(--text-muted)]">Class</dt>
        <dd>{cls.description}</dd>
        <dt className="text-[color:var(--text-muted)]">Cacheable by default</dt>
        <dd>{status.cacheable ? "Yes, unless headers say otherwise" : "No, only with explicit caching headers"}</dd>
        <dt className="text-[color:var(--text-muted)]">Defined in</dt>
        <dd>
          {status.spec ? (
            <a
              href={status.spec.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[color:var(--accent-text)] hover:underline"
            >
              {status.spec.label}
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            `Not a standard code. Used by ${status.source}.`
          )}
        </dd>
      </dl>
    </article>
  );
}

function Overview({ onPick }: { onPick: (query: string) => void }) {
  return (
    <div className="space-y-5 font-[family-name:var(--font-ui)]">
      <p>Pick a status code to see what it means, where it comes from, and what to do about it.</p>
      <dl className="space-y-3 text-sm">
        {STATUS_CLASSES.map((cls) => (
          <div key={cls.id} className="grid grid-cols-[3rem_1fr] gap-x-3">
            <dt className={`font-[family-name:var(--font-mono)] font-semibold ${CODE_TINT[cls.id]}`}>{cls.label}</dt>
            <dd>
              <span className="font-medium">{cls.name}.</span> <span className="text-[color:var(--text-muted)]">{cls.description}</span>
            </dd>
          </div>
        ))}
      </dl>
      <ExampleQueries onPick={onPick} />
    </div>
  );
}

function ExampleQueries({ onPick }: { onPick: (query: string) => void }) {
  return (
    <p className="text-sm text-[color:var(--text-muted)]">
      Try{" "}
      {EXAMPLES.map((example, i) => (
        <span key={example}>
          <button type="button" onClick={() => onPick(example)} className="text-[color:var(--accent-text)] hover:underline">
            {example}
          </button>
          {i < EXAMPLES.length - 2 ? ", " : i === EXAMPLES.length - 2 ? ", or " : "."}
        </span>
      ))}
    </p>
  );
}

export default function HttpStatus() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchStatuses(query, filter === "all" ? undefined : Number(filter)), [query, filter]);
  const selectedStatus = selected === null ? undefined : getStatus(selected);
  const activeIndex = results.findIndex((s) => s.code === selected);

  // Deep links: #429 selects 429, including when the hash changes later.
  useEffect(() => {
    const fromHash = () => {
      const code = Number(window.location.hash.slice(1));
      if (getStatus(code)) setSelected(code);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  useEffect(() => {
    if (selected === null) return;
    document.getElementById(optionId(selected))?.scrollIntoView({ block: "nearest" });
  }, [selected, results]);

  function select(code: number) {
    setSelected(code);
    window.history.replaceState(null, "", `#${code}`);
  }

  function pickExample(example: string) {
    setQuery(example);
    setFilter("all");
    searchRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    let next: number;
    if (e.key === "ArrowDown") next = activeIndex < 0 ? 0 : Math.min(results.length - 1, activeIndex + 1);
    else if (e.key === "ArrowUp") next = activeIndex < 0 ? results.length - 1 : Math.max(0, activeIndex - 1);
    else if (e.key === "Enter") next = activeIndex < 0 ? 0 : activeIndex;
    else return;
    e.preventDefault();
    select(results[next].code);
  }

  // Typing an exact code shows it straight away.
  useEffect(() => {
    if (/^\d{3}$/.test(query.trim()) && results.length === 1) select(results[0].code);
  }, [query, results]);

  return (
    <>
      <InputPanel label="Find a status code">
        <div className="space-y-4">
          <SearchInput
            ref={searchRef}
            label="Search status codes"
            placeholder="Code, class, or words, like 404, 5xx, or rate limit"
            value={query}
            onChange={setQuery}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(results[activeIndex].code) : undefined}
          />
          <SegmentedControl label="Status class" options={FILTERS} value={filter} onChange={(v) => setFilter(v as Filter)} />

          <p className="text-xs text-[color:var(--text-muted)]" aria-live="polite">
            {results.length === 1 ? "1 status code" : `${results.length} status codes`}
          </p>

          {results.length ? (
            <ul
              id={LIST_ID}
              role="listbox"
              aria-label="Status codes"
              className="max-h-[28rem] overflow-y-auto rounded-md border border-[color:var(--border)]"
            >
              {results.map((status) => {
                const isSelected = status.code === selected;
                return (
                  <li
                    key={status.code}
                    id={optionId(status.code)}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => select(status.code)}
                    className={`flex cursor-pointer items-baseline gap-3 border-b border-[color:var(--border)] px-3 py-2 text-sm last:border-b-0 ${
                      isSelected
                        ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]"
                        : "hover:bg-[color:color-mix(in_srgb,var(--accent)_6%,transparent)]"
                    }`}
                  >
                    <span className={`w-10 shrink-0 font-[family-name:var(--font-mono)] font-semibold ${CODE_TINT[statusClass(status.code)]}`}>
                      {status.code}
                    </span>
                    <span className="min-w-0 flex-1">{status.name}</span>
                    <span className="flex shrink-0 gap-1">
                      <StatusTags status={status} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div id={LIST_ID} role="listbox" aria-label="Status codes" className="rounded-md border border-dashed border-[color:var(--border)] p-4 text-sm">
              <p className="mb-2">No status code matches &ldquo;{query.trim()}&rdquo;{filter !== "all" && ` in ${filter}xx`}.</p>
              <ExampleQueries onPick={pickExample} />
            </div>
          )}
        </div>
      </InputPanel>

      <OutputPanel label="Details" copyText={selectedStatus ? `${selectedStatus.code} ${selectedStatus.name}` : undefined}>
        {selectedStatus ? <Details status={selectedStatus} /> : <Overview onPick={pickExample} />}
      </OutputPanel>
    </>
  );
}

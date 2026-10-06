"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import { CodeTextArea } from "@/components/ui/CodeField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { explainFlags, explainRegex, explanationToText, type ExplainLine } from "@/lib/tools/developer/regex-explain";
import { useWorkerJob, type WorkerJobState } from "@/lib/hooks/useWorkerJob";
import type { MatchRequest, MatchResult, RegexMatch } from "@/lib/tools/developer/regex-match";

const EXAMPLE_PATTERN = String.raw`(?<year>\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>\d{2})`;
const EXAMPLE_TEXT = "Released 2024-03-15, patched 2024-11-02.\nNot dates: 2024-13-01 and 24-03-15.";

const FLAG_OPTIONS = [
  { flag: "g", title: "Global: find every match" },
  { flag: "i", title: "Ignore case" },
  { flag: "m", title: "Multiline: ^ and $ match at line breaks" },
  { flag: "s", title: "Dot all: . matches line breaks" },
  { flag: "u", title: "Unicode" },
  { flag: "y", title: "Sticky" },
] as const;

const VIEWS = [
  { id: "matches", label: "Matches" },
  { id: "explanation", label: "Explanation" },
] as const;

const TIMEOUT_MS = 1000;
const DEBOUNCE_MS = 120;

type MatchState = WorkerJobState<MatchResult>;

function createMatchWorker() {
  return new Worker(new URL("../../../lib/tools/developer/regex.worker.ts", import.meta.url));
}

function Highlighted({ text, matches }: { text: string; matches: RegexMatch[] }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, k) => {
    if (m.start > cursor) parts.push(text.slice(cursor, m.start));
    parts.push(
      m.start === m.end ? (
        <span
          key={k}
          title={`Empty match at ${m.start}`}
          className="mx-px inline-block h-[1.1em] w-[2px] translate-y-[2px] bg-[color:var(--accent-warn-text)]"
        />
      ) : (
        <mark
          key={k}
          title={`Match ${k + 1}`}
          className={`rounded-sm text-[color:var(--text)] ${
            k % 2
              ? "bg-[color:color-mix(in_srgb,var(--accent-warn)_35%,transparent)]"
              : "bg-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
          }`}
        >
          {text.slice(m.start, m.end)}
        </mark>
      ),
    );
    cursor = Math.max(cursor, m.end);
  });
  parts.push(text.slice(cursor));
  return <pre className="whitespace-pre-wrap break-words">{parts}</pre>;
}

function MatchList({ matches }: { matches: RegexMatch[] }) {
  return (
    <ol className="space-y-3">
      {matches.map((m, k) => (
        <li key={k} className="border-l-2 border-[color:var(--border)] pl-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">#{k + 1}</span>
            <span>{m.value === "" ? <em className="text-[color:var(--text-muted)]">(empty)</em> : JSON.stringify(m.value)}</span>
            <span className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
              at {m.start}–{m.end}
            </span>
          </div>
          {m.groups.length > 0 && (
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 text-xs">
              {m.groups.map((g) => (
                <Fragment key={g.index}>
                  <dt className="text-[color:var(--accent-text)]">{g.name ?? `$${g.index}`}</dt>
                  <dd>
                    {g.value === undefined ? (
                      <span className="text-[color:var(--text-muted)]">did not participate</span>
                    ) : (
                      JSON.stringify(g.value)
                    )}
                  </dd>
                </Fragment>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
}

function ExplanationTree({ lines }: { lines: ExplainLine[] }) {
  return (
    <ul className="space-y-1.5">
      {lines.map((line, k) => (
        <li key={k}>
          <div className="flex flex-wrap items-baseline gap-x-3">
            {line.source && <code className="break-all text-[color:var(--accent-text)]">{line.source}</code>}
            <span className="font-[family-name:var(--font-ui)]">{line.text}</span>
          </div>
          {line.children.length > 0 && (
            <div className="ml-1 mt-1.5 border-l border-[color:var(--border)] pl-4">
              <ExplanationTree lines={line.children} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function matchesToJson(matches: RegexMatch[]): string {
  return JSON.stringify(
    matches.map((m) => ({
      match: m.value,
      index: m.start,
      groups: Object.fromEntries(m.groups.map((g) => [g.name ?? String(g.index), g.value ?? null])),
    })),
    null,
    2,
  );
}

export default function RegexTester() {
  const [pattern, setPattern] = useState(EXAMPLE_PATTERN);
  const [flags, setFlags] = useState("g");
  const [text, setText] = useToolInput(EXAMPLE_TEXT);
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("matches");

  const syntaxError = useMemo(() => {
    try {
      new RegExp(pattern, flags);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [pattern, flags]);

  const explanation = useMemo(() => {
    if (syntaxError) return null;
    try {
      return explainRegex(pattern, flags);
    } catch {
      return null;
    }
  }, [pattern, flags, syntaxError]);

  // Matching runs in a worker, stopped if a pattern backtracks for too long.
  const request = useMemo<MatchRequest | null>(
    () => (syntaxError === null ? { pattern, flags, text } : null),
    [pattern, flags, text, syntaxError],
  );
  const state = useWorkerJob<MatchRequest, MatchResult>(createMatchWorker, request, { timeoutMs: TIMEOUT_MS, debounceMs: DEBOUNCE_MS });

  function toggleFlag(flag: string) {
    const next = flags.includes(flag) ? flags.replace(flag, "") : flags + flag;
    setFlags(FLAG_OPTIONS.map((o) => o.flag).filter((f) => next.includes(f)).join(""));
  }

  const copyText =
    syntaxError !== null
      ? undefined
      : view === "matches"
        ? state.status === "done"
          ? matchesToJson(state.result.matches)
          : undefined
        : explanation
          ? `/${pattern}/${flags}\n\n${explanationToText(explanation)}`
          : undefined;

  return (
    <>
      <InputPanel label="Pattern and text">
        <div className="space-y-4">
          <div>
            <label htmlFor="regex-pattern" className="mb-1 block text-xs text-[color:var(--text-muted)]">
              Regular expression
            </label>
            <div
              className={`flex items-center rounded-md border px-3 font-[family-name:var(--font-mono)] text-sm focus-within:outline focus-within:outline-1 ${
                syntaxError
                  ? "border-[color:var(--error)] focus-within:outline-[color:var(--error)]"
                  : "border-[color:var(--border)] focus-within:outline-[color:var(--accent)]"
              }`}
            >
              <span aria-hidden className="text-[color:var(--text-muted)]">/</span>
              <input
                id="regex-pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={syntaxError !== null}
                aria-describedby={syntaxError ? "regex-error" : undefined}
                className="min-w-0 flex-1 bg-transparent px-1 py-2 outline-none"
              />
              <span aria-hidden className="text-[color:var(--text-muted)]">/{flags}</span>
            </div>
          </div>

          <div role="group" aria-label="Flags" className="flex flex-wrap gap-1.5">
            {FLAG_OPTIONS.map(({ flag, title }) => (
              <button
                key={flag}
                type="button"
                title={title}
                aria-pressed={flags.includes(flag)}
                onClick={() => toggleFlag(flag)}
                className={`h-8 w-8 rounded-md border font-[family-name:var(--font-mono)] text-sm ${
                  flags.includes(flag)
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--on-accent)]"
                    : "border-[color:var(--border)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                }`}
              >
                {flag}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="regex-text" className="mb-1 block text-xs text-[color:var(--text-muted)]">
              Test text
            </label>
            <CodeTextArea id="regex-text" value={text} onChange={(e) => setText(e.target.value)} rows={10} />
          </div>
        </div>
      </InputPanel>

      <OutputPanel label="Result" copyText={copyText} outputType={view === "matches" ? "json" : "text"}>
        <div className="mb-4 font-[family-name:var(--font-ui)]">
          <SegmentedControl label="View" options={VIEWS} value={view} onChange={setView} />
        </div>

        {syntaxError ? (
          <Alert id="regex-error" title="Invalid pattern">
            {syntaxError.replace(/^Invalid regular expression: /, "")}
          </Alert>
        ) : view === "matches" ? (
          <MatchesView state={state} text={text} flags={flags} />
        ) : explanation ? (
          <div className="space-y-5">
            <ExplanationTree lines={explanation} />
            {flags && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-[color:var(--border)] pt-4 text-xs">
                {explainFlags(flags).map(({ flag, text: flagText }) => (
                  <Fragment key={flag}>
                    <dt className="text-[color:var(--accent-text)]">{flag}</dt>
                    <dd className="font-[family-name:var(--font-ui)]">{flagText}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </div>
        ) : (
          <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">
            This pattern uses syntax the explainer doesn&apos;t cover yet. Matching still works.
          </p>
        )}
      </OutputPanel>
    </>
  );
}

function MatchesView({ state, text, flags }: { state: MatchState; text: string; flags: string }) {
  if (state.status === "pending") {
    return <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">Matching…</p>;
  }
  if (state.status === "timeout") {
    return (
      <Alert tone="warn" title="Stopped after 1 second">
        <p className="text-sm">
          This pattern is taking too long on this text, most likely from catastrophic backtracking. Look for nested
          quantifiers like <code className="font-[family-name:var(--font-mono)]">(a+)+</code> or overlapping
          alternatives like <code className="font-[family-name:var(--font-mono)]">(a|a)*</code>.
        </p>
      </Alert>
    );
  }
  if (state.status === "error") {
    return <p className="text-[color:var(--error)]">{state.error}</p>;
  }

  const { matches, truncated } = state.result;
  const summary =
    matches.length === 0
      ? "No matches"
      : `${matches.length.toLocaleString()}${truncated ? "+" : ""} ${matches.length === 1 ? "match" : "matches"}`;

  return (
    <div className="space-y-4">
      <p className="font-[family-name:var(--font-ui)] text-sm">
        <span className="font-semibold">{summary}</span>
        {!flags.includes("g") && matches.length > 0 && (
          <span className="text-[color:var(--text-muted)]"> (only the first; turn on g to find all)</span>
        )}
        {truncated && <span className="text-[color:var(--text-muted)]"> (stopped at 1,000)</span>}
      </p>
      <div className="rounded-md border border-[color:var(--border)] p-3">
        <Highlighted text={text} matches={matches} />
      </div>
      {matches.length > 0 && <MatchList matches={matches} />}
    </div>
  );
}

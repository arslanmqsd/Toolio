"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { CopyButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import ErrorCaret from "@/components/ui/ErrorCaret";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useWorkerJob, type WorkerJobState } from "@/lib/hooks/useWorkerJob";
import { MAX_LISTED_MATCHES, type JsonPathOutcome } from "@/lib/tools/developer/json-path";

const EXAMPLE_JSON = `{
  "store": {
    "book": [
      { "title": "A", "price": 8 },
      { "title": "B", "price": 15 },
      { "title": "C", "price": 9 }
    ]
  }
}`;
const EXAMPLE_PATH = "$.store.book[?(@.price<10)].title";

const SYNTAX: [string, string, string][] = [
  ["$", "The root of the document", "$"],
  [".name", "A child by name", "$.store.book"],
  ["..name", "That name at any depth", "$..price"],
  ["*", "Every child", "$.store.book[*].title"],
  ["[n]", "An array item, from 0; negative counts from the end", "$.store.book[0]"],
  ["[start:end]", "A slice of an array, end not included", "$.store.book[0:2]"],
  ["[?(expression)]", "Items the expression is true for, @ being the item", "$.store.book[?(@.price < 10)]"],
];

const VIEWS = [
  { id: "list", label: "Matches" },
  { id: "array", label: "JSON array" },
] as const;

// Parsing a big document can take a moment; a filter regex that backtracks can take forever.
const TIMEOUT_MS = 3000;
const DEBOUNCE_MS = 80;

type Request = { text: string; path: string };

function createWorker() {
  return new Worker(new URL("../../../lib/tools/developer/json-path.worker.ts", import.meta.url));
}

export default function JsonPathTester() {
  const jsonRef = useRef<HTMLTextAreaElement>(null);
  const pathRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useToolInput(EXAMPLE_JSON);
  const [path, setPath] = useState(EXAMPLE_PATH);
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("list");

  const request = useMemo<Request>(() => ({ text, path }), [text, path]);
  const state = useWorkerJob<Request, JsonPathOutcome>(createWorker, request, { timeoutMs: TIMEOUT_MS, debounceMs: DEBOUNCE_MS });
  const outcome = state.status === "done" ? state.result : null;

  function clear() {
    setText("");
    setPath("");
    jsonRef.current?.focus();
  }

  function select(field: HTMLInputElement | HTMLTextAreaElement | null, offset: number) {
    if (!field) return;
    field.focus();
    field.setSelectionRange(offset, Math.min(offset + 1, field.value.length));
  }

  const jsonInvalid = outcome?.kind === "json-error" && text.trim() !== "";
  const pathInvalid = outcome?.kind === "path-error";

  return (
    <>
      <InputPanel label="JSON">
        <div className="space-y-3">
          <CodeTextArea
            ref={jsonRef}
            aria-label="JSON to query"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={18}
            invalid={jsonInvalid}
            aria-describedby={jsonInvalid ? "jsonpath-json-error" : undefined}
          />
          <div className="flex justify-end">
            <Button size="sm" icon={X} onClick={clear} disabled={text === "" && path === ""}>
              Clear
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label="Results"
        copyText={outcome?.kind === "matches" && outcome.total > 0 ? outcome.valuesJson : undefined}
        outputType="json"
      >
        <div className="space-y-4">
          <div className="font-[family-name:var(--font-ui)]">
            <label htmlFor="jsonpath-expression" className="mb-1 block text-xs text-[color:var(--text-muted)]">
              JSONPath
            </label>
            <CodeInput
              ref={pathRef}
              id="jsonpath-expression"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="$.store.book[*].title"
              invalid={pathInvalid}
              aria-describedby={pathInvalid ? "jsonpath-path-error" : undefined}
            />
            <SyntaxReference />
          </div>

          <Results
            state={state}
            text={text}
            path={path}
            view={view}
            onViewChange={setView}
            onShowJson={(offset) => select(jsonRef.current, offset)}
            onShowPath={(offset) => select(pathRef.current, offset)}
          />
        </div>
      </OutputPanel>
    </>
  );
}

function SyntaxReference() {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)]">Syntax reference</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {SYNTAX.map(([term, meaning, example]) => (
          <div key={term} className="contents">
            <dt className="font-[family-name:var(--font-mono)] text-[color:var(--accent-text)]">{term}</dt>
            <dd>
              {meaning}
              <code className="mt-0.5 block break-all font-[family-name:var(--font-mono)] text-xs text-[color:var(--text-muted)]">{example}</code>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

interface ResultsProps {
  state: WorkerJobState<JsonPathOutcome>;
  text: string;
  path: string;
  view: (typeof VIEWS)[number]["id"];
  onViewChange: (view: (typeof VIEWS)[number]["id"]) => void;
  onShowJson: (offset: number) => void;
  onShowPath: (offset: number) => void;
}

function Results({ state, text, path, view, onViewChange, onShowJson, onShowPath }: ResultsProps) {
  const muted = "font-[family-name:var(--font-ui)] text-sm text-[color:var(--text-muted)]";

  if (state.status === "pending") return <p className={muted}>Running…</p>;
  if (state.status === "timeout") {
    return (
      <Alert tone="warn" title="Stopped after 3 seconds">
        <p className="text-sm">
          This query took too long. A regex in a filter can backtrack forever, e.g.{" "}
          <code className="font-[family-name:var(--font-mono)]">@.name.match(/(a+)+$/)</code>; a very large document can also be slow.
        </p>
      </Alert>
    );
  }
  if (state.status === "error") return <p className="text-[color:var(--error)]">{state.error}</p>;

  const outcome = state.result;

  if (outcome.kind === "json-error") {
    if (text.trim() === "") return <p className={muted}>Paste some JSON to query.</p>;
    const { error } = outcome;
    return (
      <Alert id="jsonpath-json-error" title="Invalid JSON">
        <p>{error.message}</p>
        <p className="mt-3 text-xs text-[color:var(--text-muted)]">
          Line {error.line}, column {error.column}
        </p>
        <ErrorCaret line={text.split("\n")[error.line - 1] ?? ""} column={error.column} className="mt-2" />
        <Button size="sm" onClick={() => onShowJson(error.offset)} className="mt-3">
          Show in JSON
        </Button>
      </Alert>
    );
  }

  if (outcome.kind === "no-path") return <p className={muted}>Type a path to query the JSON, starting with $.</p>;

  if (outcome.kind === "path-error") {
    const { error } = outcome;
    return (
      <Alert id="jsonpath-path-error" title="Invalid path">
        <p>{error.message}</p>
        {error.offset !== null && (
          <>
            <ErrorCaret line={path} column={error.offset + 1} className="mt-2" />
            <Button size="sm" onClick={() => onShowPath(error.offset!)} className="mt-3">
              Show in path
            </Button>
          </>
        )}
      </Alert>
    );
  }

  const { total, matches, valuesJson, unsafeIntegers } = outcome;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 font-[family-name:var(--font-ui)]">
        <p className="text-sm" aria-live="polite">
          {total === 0 ? (
            <>
              <span className="font-semibold">No matches</span>
              <span className="text-[color:var(--text-muted)]"> (the path is valid; nothing in this JSON fits it)</span>
            </>
          ) : (
            <span className="font-semibold">
              {total.toLocaleString()} {total === 1 ? "match" : "matches"} found
            </span>
          )}
        </p>
        {total > 0 && <SegmentedControl label="View" options={VIEWS} value={view} onChange={onViewChange} />}
      </div>

      {unsafeIntegers > 0 && (
        <p className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
          {unsafeIntegers === 1 ? "1 number in this JSON is" : `${unsafeIntegers} numbers in this JSON are`} too large for JavaScript to
          store exactly, so may show rounded.
        </p>
      )}

      {total > 0 &&
        (view === "array" ? (
          <pre className="whitespace-pre">{valuesJson}</pre>
        ) : (
          <>
            <ol className="space-y-3">
              {matches.map((m, k) => (
                <li key={k} className="border-l-2 border-[color:var(--border)] pl-3">
                  <div className="flex items-start justify-between gap-3">
                    <code className="min-w-0 break-all text-[color:var(--accent-text)]">{m.path}</code>
                    <span className="shrink-0 text-xs">
                      <CopyButton text={m.path} what={`path ${m.path}`} />
                    </span>
                  </div>
                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre text-xs">{m.json}</pre>
                  {m.shortened && (
                    <p className="mt-1 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                      Shortened here. Copy has the whole value.
                    </p>
                  )}
                </li>
              ))}
            </ol>
            {total > MAX_LISTED_MATCHES && (
              <p className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                Listing the first {MAX_LISTED_MATCHES.toLocaleString()} of {total.toLocaleString()}. Copy has them all.
              </p>
            )}
          </>
        ))}
    </div>
  );
}

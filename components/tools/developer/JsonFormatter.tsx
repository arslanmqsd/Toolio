"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { formatJson, type JsonStats } from "@/lib/tools/developer/json-format";

const EXAMPLE =
  '{"id":9007199254740993,"name":"Toolio","tags":["json","format","validate"],"owner":{"name":"Ada Lovelace","active":true,"score":98.5},"meta":null}';

const MODES = [
  { id: "format", label: "Format" },
  { id: "minify", label: "Minify" },
] as const;

const INDENTS = [
  { id: "2", label: "2 spaces" },
  { id: "4", label: "4 spaces" },
  { id: "tab", label: "Tab" },
] as const;

type Mode = (typeof MODES)[number]["id"];
type Indent = (typeof INDENTS)[number]["id"];

const INDENT_STRINGS: Record<Indent, string> = { "2": "  ", "4": "    ", tab: "\t" };

function formatBytes(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function Summary({ stats, input, output }: { stats: JsonStats; input: string; output: string }) {
  const values = Object.values(stats.counts).reduce((a, b) => a + b, 0);
  const items = [
    ["Root", stats.root],
    ["Keys", stats.keys.toLocaleString()],
    ["Values", values.toLocaleString()],
    ["Depth", String(stats.depth)],
    ["Size", `${formatBytes(input)} → ${formatBytes(output)}`],
  ];
  return (
    <div className="mb-4 space-y-2 border-b border-[color:var(--border)] pb-4 font-[family-name:var(--font-ui)] text-xs">
      <p className="font-medium text-[color:var(--accent-text)]">Valid JSON</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        {items.map(([label, value]) => (
          <div key={label} className="flex gap-1.5">
            <dt className="text-[color:var(--text-muted)]">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {stats.unsafeIntegers > 0 && (
        <p className="text-[color:var(--text-muted)]">
          {stats.unsafeIntegers === 1 ? "1 number is" : `${stats.unsafeIntegers} numbers are`} too large for JavaScript
          to store exactly; kept exactly as written.
        </p>
      )}
      {stats.duplicateKeys.length > 0 && (
        <p className="text-[color:var(--accent-warn-text)]">
          Duplicate keys: {[...new Set(stats.duplicateKeys)].join(", ")}. Most parsers keep only the last value.
        </p>
      )}
    </div>
  );
}

export default function JsonFormatter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(EXAMPLE);
  const [mode, setMode] = useState<Mode>("format");
  const [indent, setIndent] = useState<Indent>("2");
  const [sortKeys, setSortKeys] = useState(false);

  // Keep typing responsive on large documents.
  const deferredText = useDeferredValue(text);
  const result = useMemo(
    () => formatJson(deferredText, { indent: mode === "minify" ? "" : INDENT_STRINGS[indent], sortKeys }),
    [deferredText, mode, indent, sortKeys],
  );

  function showError(offset: number) {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(offset, Math.min(offset + 1, text.length));
  }

  const errorLine = result.ok ? "" : deferredText.split("\n")[result.error.line - 1] ?? "";

  return (
    <>
      <InputPanel label="JSON">
        <div className="space-y-4">
          <textarea
            ref={inputRef}
            aria-label="JSON input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!result.ok}
            aria-describedby={!result.ok ? "json-format-error" : undefined}
            className={`w-full resize-y rounded-md border bg-transparent p-3 font-[family-name:var(--font-mono)] text-sm focus:outline focus:outline-1 ${
              result.ok
                ? "border-[color:var(--border)] focus:outline-[color:var(--accent)]"
                : "border-[color:var(--error)] focus:outline-[color:var(--error)]"
            }`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl label="Mode" options={MODES} value={mode} onChange={setMode} />
            {mode === "format" && <SegmentedControl label="Indent" options={INDENTS} value={indent} onChange={setIndent} />}
            <label className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
              <input
                type="checkbox"
                checked={sortKeys}
                onChange={(e) => setSortKeys(e.target.checked)}
                className="h-4 w-4 accent-[color:var(--accent)]"
              />
              Sort keys
            </label>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label={mode === "minify" ? "Minified" : "Formatted"} copyText={result.ok ? result.output : undefined}>
        {result.ok ? (
          <>
            <Summary stats={result.stats} input={deferredText} output={result.output} />
            <pre className={`[tab-size:4] ${mode === "minify" ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
              {result.output}
            </pre>
          </>
        ) : (
          <div
            id="json-format-error"
            role="alert"
            className="rounded-md border border-[color:color-mix(in_srgb,var(--error)_40%,transparent)] p-4"
          >
            <p className="font-semibold text-[color:var(--error)]">
              {result.error.message === "Input is empty. Paste some JSON." ? "Nothing to format" : "Invalid JSON"}
            </p>
            <p className="mt-1 text-[color:var(--error)]">{result.error.message}</p>
            {deferredText.trim() !== "" && (
              <>
                <p className="mt-3 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                  Line {result.error.line}, column {result.error.column}
                </p>
                <pre className="mt-2 overflow-x-auto whitespace-pre text-xs">
                  {errorLine}
                  {"\n"}
                  <span className="text-[color:var(--error)]">
                    {errorLine.slice(0, result.error.column - 1).replace(/[^\t]/g, " ")}^
                  </span>
                </pre>
                <button
                  type="button"
                  onClick={() => showError(result.error.offset)}
                  className="mt-3 rounded-md border border-[color:var(--border)] px-3 py-1 font-[family-name:var(--font-ui)] text-sm hover:border-[color:var(--accent)]"
                >
                  Show in input
                </button>
              </>
            )}
          </div>
        )}
      </OutputPanel>
    </>
  );
}

"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeTextArea } from "@/components/ui/CodeField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { formatBytes } from "@/lib/format-bytes";
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

const textSize = (text: string) => formatBytes(new TextEncoder().encode(text).length);

function Summary({ stats, input, output }: { stats: JsonStats; input: string; output: string }) {
  const values = Object.values(stats.counts).reduce((a, b) => a + b, 0);
  const items = [
    ["Root", stats.root],
    ["Keys", stats.keys.toLocaleString()],
    ["Values", values.toLocaleString()],
    ["Depth", String(stats.depth)],
    ["Size", `${textSize(input)} → ${textSize(output)}`],
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
          <CodeTextArea
            ref={inputRef}
            aria-label="JSON input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            invalid={!result.ok}
            aria-describedby={!result.ok ? "json-format-error" : undefined}
          />
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl label="Mode" options={MODES} value={mode} onChange={setMode} />
            {mode === "format" && <SegmentedControl label="Indent" options={INDENTS} value={indent} onChange={setIndent} />}
            <Checkbox checked={sortKeys} onChange={setSortKeys}>
              Sort keys
            </Checkbox>
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
          <Alert
            id="json-format-error"
            title={result.error.message === "Input is empty. Paste some JSON." ? "Nothing to format" : "Invalid JSON"}
          >
            <p>{result.error.message}</p>
            {deferredText.trim() !== "" && (
              <>
                <p className="mt-3 text-xs text-[color:var(--text-muted)]">
                  Line {result.error.line}, column {result.error.column}
                </p>
                <pre className="mt-2 overflow-x-auto whitespace-pre font-[family-name:var(--font-mono)] text-xs text-[color:var(--text)]">
                  {errorLine}
                  {"\n"}
                  <span className="text-[color:var(--error)]">
                    {errorLine.slice(0, result.error.column - 1).replace(/[^\t]/g, " ")}^
                  </span>
                </pre>
                <Button size="sm" onClick={() => showError(result.error.offset)} className="mt-3">
                  Show in input
                </Button>
              </>
            )}
          </Alert>
        )}
      </OutputPanel>
    </>
  );
}

"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeTextArea } from "@/components/ui/CodeField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import {
  SQL_DIALECTS,
  SQL_EXAMPLES,
  formatSql,
  type SqlDialect,
  type SqlFormatOptions,
  type SqlIndent,
  type SqlLayout,
} from "@/lib/tools/developer/sql-format";

const ERROR_ID = "sql-format-error";

const LAYOUTS: readonly { id: SqlLayout; label: string }[] = [
  { id: "expanded", label: "Expanded" },
  { id: "compact", label: "Compact" },
  { id: "minify", label: "Minify" },
];

const INDENTS: readonly { id: SqlIndent; label: string }[] = [
  { id: "2", label: "2 spaces" },
  { id: "4", label: "4 spaces" },
  { id: "tab", label: "Tab" },
];

const CASES: readonly { id: SqlFormatOptions["keywordCase"]; label: string }[] = [
  { id: "upper", label: "UPPERCASE" },
  { id: "lower", label: "lowercase" },
];

export default function SqlFormatter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [dialect, setDialect] = useState<SqlDialect>("postgresql");
  const [text, setText] = useToolInput(SQL_EXAMPLES[dialect]);
  const [layout, setLayout] = useState<SqlLayout>("expanded");
  const [indent, setIndent] = useState<SqlIndent>("2");
  const [keywordCase, setKeywordCase] = useState<SqlFormatOptions["keywordCase"]>("upper");

  // Keep typing responsive on long scripts.
  const deferredText = useDeferredValue(text);
  const result = useMemo(
    () => formatSql(deferredText, { dialect, indent, keywordCase, layout }),
    [deferredText, dialect, indent, keywordCase, layout],
  );

  const empty = deferredText.trim() === "";
  const dialectLabel = SQL_DIALECTS.find((d) => d.id === dialect)?.label;

  function changeDialect(next: SqlDialect) {
    // While the input is still the example, show the new dialect's example; never replace the user's own SQL.
    if (text === SQL_EXAMPLES[dialect]) setText(SQL_EXAMPLES[next]);
    setDialect(next);
  }

  function clear() {
    setText("");
    inputRef.current?.focus();
  }

  return (
    <>
      <InputPanel label="SQL">
        <div className="space-y-4">
          <CodeTextArea
            ref={inputRef}
            aria-label="SQL input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            invalid={!result.ok && !empty}
            aria-describedby={!result.ok && !empty ? ERROR_ID : undefined}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-[color:var(--text-muted)]">Dialect</span>
              <Select value={dialect} onChange={(e) => changeDialect(e.target.value as SqlDialect)}>
                {SQL_DIALECTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </label>
            <SegmentedControl label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
            {/* Compact lines content up in a fixed column and minify has no indentation, so indent only applies when expanded. */}
            {layout === "expanded" && <SegmentedControl label="Indent" options={INDENTS} value={indent} onChange={setIndent} />}
            <SegmentedControl label="Keyword case" options={CASES} value={keywordCase} onChange={setKeywordCase} />
            <Button size="sm" onClick={clear} disabled={text === ""}>
              Clear
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label={layout === "minify" ? "Minified" : "Formatted"}
        copyText={result.ok ? result.output : undefined}
        outputType="sql"
        download={{ filename: "query.sql", mimeType: "application/sql" }}
      >
        {result.ok ? (
          <pre className={`[tab-size:4] ${layout === "minify" ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
            {result.output}
          </pre>
        ) : empty ? (
          <Alert title="Nothing to format" tone="warn">
            <p>Paste a query into the input.</p>
            <Button size="sm" onClick={() => setText(SQL_EXAMPLES[dialect])} className="mt-3">
              Load example
            </Button>
          </Alert>
        ) : (
          <Alert id={ERROR_ID} title="Couldn't format this SQL">
            <p>{result.error.message}</p>
            {result.error.line !== undefined && (
              <p className="mt-3 text-xs text-[color:var(--text-muted)]">
                Line {result.error.line}, column {result.error.column}
              </p>
            )}
            <p className="mt-3 text-xs text-[color:var(--text-muted)]">
              Read as {dialectLabel}. If the query runs fine, it may use syntax from another dialect; try switching it.
            </p>
          </Alert>
        )}
      </OutputPanel>
    </>
  );
}

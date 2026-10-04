"use client";

import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeTextArea } from "@/components/ui/CodeField";
import Select from "@/components/ui/Select";
import {
  MONGO_SQL_DIALECTS,
  convertSqlToMongo,
  type ConversionNote,
  type MongoSqlDialect,
} from "@/lib/tools/developer/sql-to-mongo";

const EXAMPLE = `SELECT name, email FROM users WHERE age > 25 AND active = true
ORDER BY name ASC LIMIT 10;`;

const ERROR_ID = "sql-to-mongo-error";

function ConversionNotes({ notes }: { notes: ConversionNote[] }) {
  const headingId = useId();
  const blockers = notes.filter((n) => n.level === "unsupported").length;
  return (
    <section aria-labelledby={headingId} className="mt-4 border-t border-[color:var(--border)] pt-4 font-[family-name:var(--font-ui)] text-xs">
      <h3 id={headingId} className="flex items-center gap-2 font-medium text-[color:var(--text-muted)]">
        Conversion notes
        <span
          className={`rounded-full px-1.5 py-px tabular-nums ${
            blockers
              ? "bg-[color:color-mix(in_srgb,var(--accent-warn)_20%,transparent)] text-[color:var(--accent-warn-text)]"
              : "bg-[color:var(--border)] text-[color:var(--text)]"
          }`}
        >
          {notes.length}
          <span className="sr-only">{notes.length === 1 ? " note" : " notes"}</span>
        </span>
      </h3>
      <ul className="mt-2 space-y-2">
        {notes.map((note) => (
          <li key={`${note.construct}: ${note.message}`}>
            <span className={`font-medium ${note.level === "unsupported" ? "text-[color:var(--accent-warn-text)]" : ""}`}>
              {note.level === "unsupported" ? "Not supported: " : ""}
              <code className="font-[family-name:var(--font-mono)]">{note.construct}</code>
            </span>
            <span className="text-[color:var(--text-muted)]"> — {note.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SqlToMongo() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useToolInput(EXAMPLE);
  const [dialect, setDialect] = useState<MongoSqlDialect>("postgresql");

  // Keep typing responsive on long queries.
  const deferredText = useDeferredValue(text);
  const result = useMemo(() => convertSqlToMongo(deferredText, dialect), [deferredText, dialect]);

  const empty = deferredText.trim() === "";
  const output = result.ok ? result.output : undefined;
  const dialectLabel = MONGO_SQL_DIALECTS.find((d) => d.id === dialect)?.label;

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
              <Select value={dialect} onChange={(e) => setDialect(e.target.value as MongoSqlDialect)}>
                {MONGO_SQL_DIALECTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </label>
            <Button size="sm" onClick={clear} disabled={text === ""}>
              Clear
            </Button>
          </div>
          <p className="text-xs text-[color:var(--text-muted)]">
            Converts one SELECT into a find() call. Joins, grouping and aggregates are listed as notes instead of guessed at.
          </p>
        </div>
      </InputPanel>

      <OutputPanel
        label="MongoDB"
        copyText={output}
        outputType="mongodb"
        download={{ filename: "query.js", mimeType: "text/javascript" }}
      >
        {result.ok ? (
          <>
            {output ? (
              <pre className="whitespace-pre">{output}</pre>
            ) : (
              <Alert title="Can't convert this query to find()" tone="warn">
                <p>It uses SQL that a find() call can&apos;t express. See the conversion notes below.</p>
              </Alert>
            )}
            {result.notes.length > 0 && <ConversionNotes notes={result.notes} />}
          </>
        ) : empty ? (
          <Alert title="Nothing to convert" tone="warn">
            <p>Paste a SELECT query into the input.</p>
            <Button size="sm" onClick={() => setText(EXAMPLE)} className="mt-3">
              Load example
            </Button>
          </Alert>
        ) : (
          <Alert id={ERROR_ID} title="Couldn't read this SQL">
            <p>{result.error.message}</p>
            {result.error.line !== undefined && (
              <p className="mt-3 text-xs text-[color:var(--text-muted)]">
                Line {result.error.line}, column {result.error.column}
              </p>
            )}
            <p className="mt-3 text-xs text-[color:var(--text-muted)]">
              Read as {dialectLabel}. If the query runs fine, it may use syntax from the other dialect; try switching it.
            </p>
          </Alert>
        )}
      </OutputPanel>
    </>
  );
}

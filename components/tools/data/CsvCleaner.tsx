"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeTextArea, selectLine } from "@/components/ui/CodeField";
import ErrorLocation from "@/components/ui/ErrorLocation";
import FileDrop from "@/components/ui/FileDrop";
import LabelledControl from "@/components/ui/LabelledControl";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TabularOutput, { type TabularView } from "@/components/ui/TabularOutput";
import { readTextFile } from "@/lib/files/text-file";
import { useWorkerJob } from "@/lib/hooks/useWorkerJob";
import { plural } from "@/lib/notices";
import { DEFAULT_CSV_CLEAN, type CsvCleanOptions, type CsvCleanRequest, type CsvCleanResult } from "@/lib/tools/data/csv-clean";
import { DELIMITERS, delimiterNames } from "@/lib/tools/data/json-csv";

const EXAMPLE = ` Name , Email ,Signed up,,Plan
Ada Lovelace,ada@example.com ,2024-01-05,,Pro
  Grace Hopper,grace@example.com,2024-02-11,,Free

Alan Turing,alan@example.com,2024-03-01,,Pro,,
Ada Lovelace, ada@example.com,2024-01-05,,Pro
,,,,
Linus Torvalds,linus@example.com​,2024-04-20,
Margaret Hamilton,margaret@example.com,2024-05-02,,"=HYPERLINK(""https://example.com"")"
`;

const DELIMITER_OPTIONS = DELIMITERS.map((d) => ({ id: d, label: delimiterNames[d] }));
const READ_DELIMITERS = [{ id: "auto" as const, label: "Detect" }, ...DELIMITER_OPTIONS];
const WRITE_DELIMITERS = [{ id: "same" as const, label: "Same" }, ...DELIMITER_OPTIONS];

const TIMEOUT_MS = 20_000;
const DEBOUNCE_MS = 200;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ERROR_ID = "csv-clean-error";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/data/csv-clean.worker.ts", import.meta.url));
}

function OptionGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {children}
    </fieldset>
  );
}

export default function CsvCleaner() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useToolInput(EXAMPLE, () => {
    setFileBase(null);
    setLegacyEncoding(false);
  });
  const [options, setOptions] = useState<CsvCleanOptions>(DEFAULT_CSV_CLEAN);
  const [bom, setBom] = useState(false);
  const [view, setView] = useState<TabularView>("text");
  const [fileBase, setFileBase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [legacyEncoding, setLegacyEncoding] = useState(false);

  const empty = text.trim() === "";
  const request = useMemo<CsvCleanRequest | null>(() => (empty ? null : { text, options }), [empty, text, options]);
  const state = useWorkerJob<CsvCleanRequest, CsvCleanResult>(createWorker, request, { timeoutMs: TIMEOUT_MS, debounceMs: DEBOUNCE_MS });
  // The last result stays up while the next one is worked out.
  const result = state.status === "done" ? state.result : null;
  const output = result?.ok ? result.output : undefined;
  const invalid = !empty && result !== null && !result.ok;
  const writtenWith = result?.ok ? (options.outputDelimiter === "same" ? result.delimiter : options.outputDelimiter) : options.outputDelimiter;
  const tsv = writtenWith === "\t";

  // Text that didn't come from the loaded file: its name and encoding no longer apply.
  function editText(value: string) {
    setText(value);
    setFileBase(null);
    setLegacyEncoding(false);
  }

  const set = <K extends keyof CsvCleanOptions>(key: K, value: CsvCleanOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));

  async function loadFile(file: File) {
    const read = await readTextFile(file, MAX_FILE_BYTES, { legacyFallback: true });
    if (!read.ok) {
      setFileError(read.error);
      return;
    }
    setFileError(undefined);
    setText(read.text);
    setFileBase(file.name.replace(/\.[^.]+$/, "") || null);
    setLegacyEncoding(read.encoding === "windows-1252");
  }

  function clear() {
    editText("");
    inputRef.current?.focus();
  }

  const download = output
    ? {
        filename: `${fileBase ?? "data"}-clean.${tsv ? "tsv" : "csv"}`,
        mimeType: tsv ? "text/tab-separated-values" : "text/csv",
        content: bom ? new TextEncoder().encode(`﻿${output}`) : undefined,
      }
    : undefined;

  return (
    <>
      <InputPanel label="CSV">
        <div className="space-y-4">
          <div className="space-y-2">
            <CodeTextArea
              ref={inputRef}
              aria-label="CSV input"
              value={text}
              onChange={(e) => editText(e.target.value)}
              rows={14}
              wrap="off"
              invalid={invalid}
              aria-describedby={invalid ? ERROR_ID : undefined}
              placeholder={"name,email\nAda,ada@example.com"}
            />
            <FileDrop compact accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" what="a .csv or .tsv file" onFiles={([file]) => loadFile(file)} />
            {fileError && (
              <p role="alert" className="text-xs text-[color:var(--error)]">
                {fileError}
              </p>
            )}
            {legacyEncoding && (
              <p className="text-xs text-[color:var(--text-muted)]">
                This file isn&apos;t UTF-8, so it was read as Windows-1252, the encoding Excel uses on Windows. The cleaned file is UTF-8.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <LabelledControl label="Delimiter">
              <SegmentedControl label="Delimiter" options={READ_DELIMITERS} value={options.delimiter} onChange={(v) => set("delimiter", v)} />
            </LabelledControl>
            <Checkbox checked={options.header} onChange={(v) => set("header", v)}>
              The first row is the header
            </Checkbox>
          </div>

          <OptionGroup legend="Cells">
            <Checkbox checked={options.trim} onChange={(v) => set("trim", v)}>
              Trim spaces around values
            </Checkbox>
            <Checkbox checked={options.invisible} onChange={(v) => set("invisible", v)}>
              Remove invisible characters and turn non-breaking spaces into spaces
            </Checkbox>
            <Checkbox checked={options.collapseSpaces} onChange={(v) => set("collapseSpaces", v)}>
              Collapse runs of spaces and line breaks into one space
            </Checkbox>
          </OptionGroup>

          <OptionGroup legend="Rows and columns">
            <Checkbox checked={options.emptyRows} onChange={(v) => set("emptyRows", v)}>
              Remove empty rows
            </Checkbox>
            <Checkbox checked={options.emptyColumns} onChange={(v) => set("emptyColumns", v)}>
              Remove columns with no name and no values
            </Checkbox>
            <Checkbox checked={options.duplicates} onChange={(v) => set("duplicates", v)}>
              Remove duplicate rows, keeping the first
            </Checkbox>
            <Checkbox checked={options.evenRows} onChange={(v) => set("evenRows", v)}>
              Give every row the same number of fields
            </Checkbox>
            {options.header && (
              <Checkbox checked={options.fixHeader} onChange={(v) => set("fixHeader", v)}>
                Name unnamed columns and number repeated names
              </Checkbox>
            )}
          </OptionGroup>

          <OptionGroup legend="Output">
            <LabelledControl label="Delimiter">
              <SegmentedControl label="Output delimiter" options={WRITE_DELIMITERS} value={options.outputDelimiter} onChange={(v) => set("outputDelimiter", v)} />
            </LabelledControl>
            <Checkbox checked={options.escapeFormulas} onChange={(v) => set("escapeFormulas", v)}>
              Escape cells a spreadsheet would run as formulas (=, +, -, @)
            </Checkbox>
            <Checkbox checked={options.crlf} onChange={(v) => set("crlf", v)}>
              Windows line endings (CRLF)
            </Checkbox>
            <Checkbox checked={bom} onChange={setBom}>
              Add a byte order mark to the download, so Excel reads accents correctly
            </Checkbox>
          </OptionGroup>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={clear} disabled={text === ""}>
              Clear
            </Button>
            <Button size="sm" onClick={() => editText(EXAMPLE)} disabled={text === EXAMPLE}>
              Load example
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label={tsv ? "Cleaned TSV" : "Cleaned CSV"} copyText={empty ? undefined : output} outputType="csv" download={download}>
        {empty ? (
          <Alert title="Nothing to clean" tone="warn">
            <p>Paste CSV into the input, or drop a file.</p>
            <Button size="sm" onClick={() => editText(EXAMPLE)} className="mt-3">
              Load example
            </Button>
          </Alert>
        ) : (
          <CleanResult state={state} inputText={text} inputRef={inputRef} view={view} onView={setView} />
        )}
      </OutputPanel>
    </>
  );
}

interface CleanResultProps {
  state: ReturnType<typeof useWorkerJob<CsvCleanRequest, CsvCleanResult>>;
  inputText: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  view: TabularView;
  onView: (view: TabularView) => void;
}

function CleanResult({ state, inputText, inputRef, view, onView }: CleanResultProps) {
  if (state.status === "pending") return <p className="font-[family-name:var(--font-ui)] text-sm text-[color:var(--text-muted)]">Working…</p>;
  if (state.status === "timeout") {
    return (
      <Alert title="This took too long">
        <p>The file is too big to clean here, so it was stopped. Try a smaller part of it.</p>
      </Alert>
    );
  }
  if (state.status === "error") {
    return (
      <Alert title="Something went wrong">
        <p>{state.error}</p>
      </Alert>
    );
  }

  const result = state.result;
  if (!result.ok) {
    const { message, line, column } = result.error;
    return (
      <Alert id={ERROR_ID} title="This CSV can't be read">
        <p>{message}</p>
        <ErrorLocation source={inputText} line={line} column={column} onShow={() => selectLine(inputRef.current, line)} />
      </Alert>
    );
  }

  const { stats } = result;
  const shape = (rows: number, columns: number) => `${plural(rows, "row", "rows")} × ${plural(columns, "column", "columns")}`;
  const before = shape(stats.rowsBefore, stats.columnsBefore);
  const after = shape(stats.rowsAfter, stats.columnsAfter);
  return (
    <TabularOutput
      summary={
        <>
          {before === after ? (
            after
          ) : (
            <>
              {before} → <span className="font-medium text-[color:var(--text)]">{after}</span>
            </>
          )}
          {" · "}
          {delimiterNames[result.delimiter]}-separated
          {!result.changed && <> · nothing needed cleaning</>}
        </>
      }
      notices={result.notices}
      textLabel="CSV"
      text={result.output}
      table={result.table}
      tableLabel="Cleaned CSV"
      view={view}
      onView={onView}
    />
  );
}

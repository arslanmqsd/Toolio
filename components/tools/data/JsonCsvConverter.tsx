"use client";

import { useMemo, useRef, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import { detectType } from "@/components/workbench/detectors";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeTextArea, selectLine } from "@/components/ui/CodeField";
import ErrorLocation from "@/components/ui/ErrorLocation";
import FileDrop from "@/components/ui/FileDrop";
import LabelledControl from "@/components/ui/LabelledControl";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TabularOutput, { type TabularView } from "@/components/ui/TabularOutput";
import type { Delimiter } from "@/lib/csv/write";
import { readTextFile } from "@/lib/files/text-file";
import { useWorkerJob } from "@/lib/hooks/useWorkerJob";
import {
  DEFAULT_CSV_TO_JSON,
  DEFAULT_JSON_TO_CSV,
  delimiterNames,
  type CsvToJsonOptions,
  type JsonCsvJobResult,
  type JsonCsvRequest,
  type JsonToCsvOptions,
} from "@/lib/tools/data/json-csv";

const EXAMPLE_JSON = `[
  {
    "id": 1,
    "name": "Ada Lovelace",
    "address": { "city": "London", "zip": "01234" },
    "tags": ["math", "poetry"],
    "active": true
  },
  {
    "id": 9007199254740993,
    "name": "Smith, Jo",
    "address": { "city": "Oslo", "zip": "0150" },
    "tags": [],
    "active": false,
    "note": "Said \\"hi\\"\\nthen left"
  },
  {
    "id": 3,
    "name": "Grace Hopper",
    "address": { "city": "New York" },
    "note": "=SUM(A1:A3)"
  }
]
`;

const EXAMPLE_CSV = `id;name;address.city;address.zip;active;joined
1;Ada Lovelace;London;01234;true;1843-07-01
2;"Smith; Jo";Oslo;0150;false;
3;Grace Hopper;New York;;TRUE;1944-08-07
`;

type Direction = JsonCsvRequest["direction"];

const DIRECTIONS = [
  { id: "json-to-csv", label: "JSON → CSV" },
  { id: "csv-to-json", label: "CSV → JSON" },
] as const;

const DELIMITER_OPTIONS = [
  { id: ",", label: "Comma" },
  { id: ";", label: "Semicolon" },
  { id: "\t", label: "Tab" },
  { id: "|", label: "Pipe" },
] as const;

const READ_DELIMITERS = [{ id: "auto", label: "Detect" }, ...DELIMITER_OPTIONS] as const;

const ARRAYS = [
  { id: "json", label: "JSON in one cell" },
  { id: "columns", label: "A column per item" },
] as const;

const JSON_INDENTS = [
  { id: "2", label: "2 spaces" },
  { id: "4", label: "4 spaces" },
  { id: "min", label: "Minify" },
] as const;

type JsonIndent = (typeof JSON_INDENTS)[number]["id"];

const TIMEOUT_MS = 20_000;
const DEBOUNCE_MS = 200;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ERROR_ID = "json-csv-error";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/data/json-csv.worker.ts", import.meta.url));
}

const directionOf = (text: string): Direction => (detectType(text) === "json" ? "json-to-csv" : "csv-to-json");

function directionForFile(name: string, text: string): Direction {
  if (/\.json$/i.test(name)) return "json-to-csv";
  if (/\.(csv|tsv)$/i.test(name)) return "csv-to-json";
  return directionOf(text);
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default function JsonCsvConverter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [direction, setDirection] = useState<Direction>("json-to-csv");
  const [text, setText] = useToolInput(EXAMPLE_JSON, (value) => {
    setFileBase(null);
    setDirection(directionOf(value));
  });
  const [readOptions, setReadOptions] = useState<Omit<CsvToJsonOptions, "indent">>(DEFAULT_CSV_TO_JSON);
  const [indent, setIndent] = useState<JsonIndent>("2");
  const [writeOptions, setWriteOptions] = useState<JsonToCsvOptions>(DEFAULT_JSON_TO_CSV);
  const [bom, setBom] = useState(false);
  const [view, setView] = useState<TabularView>("text");
  const [fileBase, setFileBase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();

  const empty = text.trim() === "";
  const request = useMemo<JsonCsvRequest | null>(() => {
    if (empty) return null;
    if (direction === "json-to-csv") return { direction, text, options: writeOptions };
    return { direction, text, options: { ...readOptions, indent: indent === "min" ? "" : " ".repeat(Number(indent)) } };
  }, [empty, direction, text, writeOptions, readOptions, indent]);
  const state = useWorkerJob<JsonCsvRequest, JsonCsvJobResult>(createWorker, request, { timeoutMs: TIMEOUT_MS, debounceMs: DEBOUNCE_MS });
  // The last result stays up while the next one is worked out, but not one for the other direction.
  const result = state.status === "done" && state.result.direction === direction ? state.result : null;
  const output = result?.ok ? result.output : undefined;
  const invalid = !empty && result !== null && !result.ok;
  const toCsv = direction === "json-to-csv";
  const inputType = toCsv ? "JSON" : "CSV";
  const tsv = toCsv && writeOptions.delimiter === "\t";

  const setRead = <K extends keyof CsvToJsonOptions>(key: K, value: CsvToJsonOptions[K]) => setReadOptions((o) => ({ ...o, [key]: value }));
  const setWrite = <K extends keyof JsonToCsvOptions>(key: K, value: JsonToCsvOptions[K]) => setWriteOptions((o) => ({ ...o, [key]: value }));

  function changeDirection(next: Direction) {
    // Carry the result over so the round trip is one click.
    if (output) setText(output);
    setDirection(next);
  }

  async function loadFile(file: File) {
    const read = await readTextFile(file, MAX_FILE_BYTES);
    if (!read.ok) {
      setFileError(read.error);
      return;
    }
    setFileError(undefined);
    setText(read.text);
    setFileBase(file.name.replace(/\.[^.]+$/, "") || null);
    setDirection(directionForFile(file.name, read.text));
  }

  function loadExample() {
    setText(toCsv ? EXAMPLE_JSON : EXAMPLE_CSV);
  }

  function clear() {
    setText("");
    inputRef.current?.focus();
  }

  const example = toCsv ? EXAMPLE_JSON : EXAMPLE_CSV;
  const download = output
    ? toCsv
      ? {
          filename: `${fileBase ?? "data"}.${tsv ? "tsv" : "csv"}`,
          mimeType: tsv ? "text/tab-separated-values" : "text/csv",
          content: bom ? new TextEncoder().encode(`﻿${output}`) : undefined,
        }
      : { filename: `${fileBase ?? "data"}.json`, mimeType: "application/json" }
    : undefined;

  return (
    <>
      <InputPanel label={inputType}>
        <div className="space-y-4">
          <SegmentedControl label="Direction" options={DIRECTIONS} value={direction} onChange={changeDirection} />
          <div className="space-y-2">
            <CodeTextArea
              ref={inputRef}
              aria-label={`${inputType} input`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              wrap="off"
              invalid={invalid}
              aria-describedby={invalid ? ERROR_ID : undefined}
              placeholder={toCsv ? '[{"name": "Ada", "age": 36}]' : "name,age\nAda,36"}
            />
            <FileDrop compact accept=".csv,.tsv,.json,.txt,text/csv,text/tab-separated-values,application/json" what="a .csv, .tsv or .json file" onFiles={([file]) => loadFile(file)} />
            {fileError && (
              <p role="alert" className="text-xs text-[color:var(--error)]">
                {fileError}
              </p>
            )}
          </div>

          {toCsv ? (
            <div className="space-y-3">
              <LabelledControl label="Delimiter">
                <SegmentedControl label="Delimiter" options={DELIMITER_OPTIONS} value={writeOptions.delimiter} onChange={(v) => setWrite("delimiter", v)} />
              </LabelledControl>
              <LabelledControl label="Arrays">
                <SegmentedControl label="Arrays" options={ARRAYS} value={writeOptions.arrays} onChange={(v) => setWrite("arrays", v)} />
              </LabelledControl>
              <Checkbox checked={writeOptions.escapeFormulas} onChange={(v) => setWrite("escapeFormulas", v)}>
                Escape cells a spreadsheet would run as formulas (=, +, -, @)
              </Checkbox>
              <Checkbox checked={writeOptions.crlf} onChange={(v) => setWrite("crlf", v)}>
                Windows line endings (CRLF)
              </Checkbox>
              <Checkbox checked={bom} onChange={setBom}>
                Add a byte order mark to the download, so Excel reads accents correctly
              </Checkbox>
              <p className="text-xs text-[color:var(--text-muted)]">Nested objects become columns like address.city. Numbers keep every digit.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <LabelledControl label="Delimiter">
                <SegmentedControl label="Delimiter" options={READ_DELIMITERS} value={readOptions.delimiter} onChange={(v) => setRead("delimiter", v)} />
              </LabelledControl>
              <LabelledControl label="JSON indent">
                <SegmentedControl label="JSON indent" options={JSON_INDENTS} value={indent} onChange={setIndent} />
              </LabelledControl>
              <Checkbox checked={readOptions.header} onChange={(v) => setRead("header", v)}>
                The first row is the header (rows become objects, not arrays)
              </Checkbox>
              <Checkbox checked={readOptions.inferTypes} onChange={(v) => setRead("inferTypes", v)}>
                Read numbers, true/false and null as values (007 and 1e5 stay text)
              </Checkbox>
              <Checkbox checked={readOptions.emptyAsNull} onChange={(v) => setRead("emptyAsNull", v)}>
                Empty cells become null
              </Checkbox>
              {readOptions.header && (
                <Checkbox checked={readOptions.nest} onChange={(v) => setRead("nest", v)}>
                  Nest dot-separated headers (address.city) into objects
                </Checkbox>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={clear} disabled={text === ""}>
              Clear
            </Button>
            <Button size="sm" onClick={loadExample} disabled={text === example}>
              Load example
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label={toCsv ? (tsv ? "TSV" : "CSV") : "JSON"} copyText={empty ? undefined : output} outputType={toCsv ? "csv" : "json"} download={download}>
        {empty ? (
          <Alert title="Nothing to convert" tone="warn">
            <p>Paste {inputType} into the input, or drop a file.</p>
            <Button size="sm" onClick={loadExample} className="mt-3">
              Load example
            </Button>
          </Alert>
        ) : (
          <>
            {/* Only the start is checked: parsing a large file on every keystroke to find out would be slow. */}
            {!toCsv && /^\s*[[{]/.test(text.slice(0, 100)) && (
              <p className="mb-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                This looks like JSON.{" "}
                <button type="button" onClick={() => setDirection("json-to-csv")} className="text-[color:var(--accent-text)] underline">
                  Convert JSON → CSV instead
                </button>
              </p>
            )}
            <ConversionResult state={state} result={result} inputType={inputType} inputText={text} inputRef={inputRef} view={view} onView={setView} />
          </>
        )}
      </OutputPanel>
    </>
  );
}

interface ConversionResultProps {
  state: ReturnType<typeof useWorkerJob<JsonCsvRequest, JsonCsvJobResult>>;
  result: JsonCsvJobResult | null;
  inputType: string;
  inputText: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  view: TabularView;
  onView: (view: TabularView) => void;
}

function ConversionResult({ state, result, inputType, inputText, inputRef, view, onView }: ConversionResultProps) {
  const muted = "font-[family-name:var(--font-ui)] text-sm text-[color:var(--text-muted)]";
  if (state.status === "timeout") {
    return (
      <Alert title="This took too long">
        <p>The file is too big to convert here, so it was stopped. Try a smaller part of it.</p>
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
  if (!result) return <p className={muted}>Working…</p>;

  if (!result.ok) {
    const { message, line, column } = result.error;
    return (
      <Alert id={ERROR_ID} title={`Invalid ${inputType}`}>
        <p>{message}</p>
        <ErrorLocation source={inputText} line={line} column={column} onShow={() => selectLine(inputRef.current, line)} />
      </Alert>
    );
  }

  const toCsv = result.direction === "json-to-csv";
  const { table } = result;
  const delimiter: Delimiter | null = "delimiter" in result ? result.delimiter : null;
  return (
    <TabularOutput
      summary={
        <>
          {count(table.rowCount, "row", "rows")} × {count(table.columnCount, "column", "columns")}
          {delimiter && <> · {delimiterNames[delimiter]}-separated</>}
        </>
      }
      notices={result.notices}
      textLabel={toCsv ? "CSV" : "JSON"}
      text={result.output}
      table={table}
      tableLabel={toCsv ? "CSV output" : "CSV input"}
      view={view}
      onView={onView}
    />
  );
}

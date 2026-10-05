"use client";

import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import { detectType } from "@/components/workbench/detectors";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeTextArea } from "@/components/ui/CodeField";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { readTextFile } from "@/lib/tools/developer/diff/text-file";
import { convertRecords, type Direction, type LineError } from "@/lib/tools/developer/json-jsonl";

const EXAMPLE = `[
  { "id": 1, "name": "Ada", "team": { "name": "Core" } },
  { "id": 2, "name": "Grace", "team": { "name": "Compilers" } },
  { "id": 3, "name": "Linus", "team": { "name": "Kernel" } }
]`;

const DIRECTIONS = [
  { id: "json-to-jsonl", label: "JSON → JSONL" },
  { id: "jsonl-to-json", label: "JSONL → JSON" },
] as const;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ERRORS_SHOWN = 100;
const MAX_FIELDS_SHOWN = 100;
const ERROR_ID = "json-jsonl-error";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function directionForFile(name: string): Direction | null {
  if (/\.(jsonl|ndjson)$/i.test(name)) return "jsonl-to-json";
  if (/\.json$/i.test(name)) return "json-to-jsonl";
  return null;
}

function LineErrors({ errors, lines, onShow }: { errors: LineError[]; lines: number; onShow: (line: number) => void }) {
  const hidden = errors.length - MAX_ERRORS_SHOWN;
  return (
    <div className="mb-4">
      <Alert id={ERROR_ID} tone="warn" title={`${plural(errors.length, "error")} found`}>
        <p className="text-xs text-[color:var(--text-muted)]">
          Valid lines: {(lines - errors.length).toLocaleString()} / {lines.toLocaleString()}. Bad lines are left out of the output.
        </p>
        <ul className="mt-3 space-y-1.5 text-xs">
          {errors.slice(0, MAX_ERRORS_SHOWN).map((error) => (
            <li key={error.line} className="flex flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                onClick={() => onShow(error.line)}
                className="font-medium tabular-nums text-[color:var(--accent-text)] underline"
                aria-label={`Show line ${error.line} in input`}
              >
                Line {error.line}
              </button>
              <span>
                {error.message} <span className="text-[color:var(--text-muted)]">(column {error.column})</span>
              </span>
            </li>
          ))}
        </ul>
        {hidden > 0 && <p className="mt-2 text-xs text-[color:var(--text-muted)]">…and {plural(hidden, "more error")}.</p>}
      </Alert>
    </div>
  );
}

function FieldPicker({ fields, keep, onChange }: { fields: string[]; keep: string[]; onChange: (keep: string[]) => void }) {
  const legendId = useId();
  const picked = new Set(keep.filter((k) => fields.includes(k)));
  const toggle = (field: string) => onChange(picked.has(field) ? keep.filter((k) => k !== field) : [...keep, field]);
  return (
    <fieldset aria-labelledby={legendId} className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <legend id={legendId} className="text-sm font-medium">
          Keep fields
        </legend>
        <Button size="sm" onClick={() => onChange([])} disabled={picked.size === 0}>
          Keep all
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {fields.slice(0, MAX_FIELDS_SHOWN).map((field) => (
          <button
            key={field}
            type="button"
            aria-pressed={picked.has(field)}
            onClick={() => toggle(field)}
            className={`rounded-full border px-2.5 py-0.5 font-[family-name:var(--font-mono)] text-xs ${
              picked.has(field)
                ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--on-accent)]"
                : "border-[color:var(--border)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
            }`}
          >
            {field}
          </button>
        ))}
      </div>
      <p className="text-xs text-[color:var(--text-muted)]">
        {picked.size === 0
          ? "Pick fields to keep; the rest are removed. With none picked, every field is kept."
          : `Keeping ${plural(picked.size, "field")}; ${plural(fields.length - picked.size, "other")} removed.`}
        {fields.length > MAX_FIELDS_SHOWN && ` Showing the first ${MAX_FIELDS_SHOWN} of ${fields.length.toLocaleString()} fields.`}
      </p>
    </fieldset>
  );
}

export default function JsonJsonlConverter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useToolInput(EXAMPLE, (value) => {
    setFileBase(null);
    setDirection(detectType(value) === "jsonl" ? "jsonl-to-json" : "json-to-jsonl");
  });
  const [direction, setDirection] = useState<Direction>("json-to-jsonl");
  const [pretty, setPretty] = useState(true);
  const [flatten, setFlatten] = useState(false);
  const [keep, setKeep] = useState<string[]>([]);
  const [fileBase, setFileBase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();

  // Keep typing responsive on large files. Text and direction are deferred together: switching direction
  // also swaps the text, and reading the old text the new way would flash a screen of errors.
  const input = useMemo(() => ({ text, direction }), [text, direction]);
  const deferred = useDeferredValue(input);
  const deferredText = deferred.text;
  const result = useMemo(
    () => convertRecords(deferred.text, { direction: deferred.direction, flatten, keep, indent: pretty ? "  " : "" }),
    [deferred, flatten, keep, pretty],
  );

  // The input panel follows the toggle; the output panel follows the result it's showing.
  const toJsonl = direction === "json-to-jsonl";
  const inputType = toJsonl ? "JSON" : "JSONL";
  const resultToJsonl = deferred.direction === "json-to-jsonl";
  const resultInputType = resultToJsonl ? "JSON" : "JSONL";
  const outputType = resultToJsonl ? "jsonl" : "json";
  const empty = deferredText.trim() === "";
  const output = result.ok && result.output ? result.output : undefined;
  const hasLineErrors = result.ok && result.errors.length > 0;

  function changeDirection(next: Direction) {
    // Carry a clean result over so the round trip is one click.
    if (result.ok && result.output && result.errors.length === 0) setText(result.output);
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
    setDirection(directionForFile(file.name) ?? (detectType(read.text) === "jsonl" ? "jsonl-to-json" : "json-to-jsonl"));
  }

  function selectLine(line: number) {
    const input = inputRef.current;
    if (!input) return;
    const lines = text.split("\n");
    const start = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0);
    input.focus();
    input.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  }

  const invalid = (!result.ok && !empty) || hasLineErrors;

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
              rows={14}
              invalid={invalid}
              aria-describedby={invalid ? ERROR_ID : undefined}
              placeholder={toJsonl ? '[{"id": 1}, {"id": 2}]' : '{"id": 1}\n{"id": 2}'}
            />
            <FileDrop compact accept=".json,.jsonl,.ndjson,application/json" what="a .json or .jsonl file" onFiles={([file]) => loadFile(file)} />
            {fileError && (
              <p role="alert" className="text-xs text-[color:var(--error)]">
                {fileError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {!toJsonl && (
              <Checkbox checked={pretty} onChange={setPretty}>
                Pretty print
              </Checkbox>
            )}
            <Checkbox checked={flatten} onChange={setFlatten}>
              Flatten nested objects
            </Checkbox>
          </div>
          {flatten && (
            <p className="-mt-2 text-xs text-[color:var(--text-muted)]">
              {'{"user": {"name": "Ada"}} becomes {"user.name": "Ada"}. Arrays are kept as they are.'}
            </p>
          )}
          {result.ok && result.fields.length > 0 && <FieldPicker fields={result.fields} keep={keep} onChange={setKeep} />}
        </div>
      </InputPanel>

      <OutputPanel
        label={resultToJsonl ? "JSONL" : "JSON"}
        copyText={output}
        outputType={outputType}
        download={{
          filename: `${fileBase ?? "data"}.${outputType}`,
          mimeType: resultToJsonl ? "application/x-ndjson" : "application/json",
        }}
      >
        {result.ok ? (
          <>
            {hasLineErrors ? (
              <LineErrors errors={result.errors} lines={result.lines} onShow={selectLine} />
            ) : (
              <p className="mb-4 border-b border-[color:var(--border)] pb-4 font-[family-name:var(--font-ui)] text-xs">
                <span className="text-[color:var(--text-muted)]">
                  {plural(result.records, "record")} · {plural(result.lines, "line")} ·{" "}
                </span>
                <span className="font-medium text-[color:var(--accent-text)]">Valid</span>
              </p>
            )}
            {output && <pre className="whitespace-pre">{output}</pre>}
          </>
        ) : empty ? (
          <Alert title="Nothing to convert" tone="warn">
            <p>Paste {resultToJsonl ? "a JSON array" : "JSON Lines"} into the input, or drop a file.</p>
            <Button
              size="sm"
              onClick={() => {
                setText(EXAMPLE);
                setDirection("json-to-jsonl");
              }}
              className="mt-3"
            >
              Load example
            </Button>
          </Alert>
        ) : (
          <Alert id={ERROR_ID} title={`Invalid ${resultInputType}`}>
            <p>{result.error.message}</p>
            <p className="mt-3 text-xs text-[color:var(--text-muted)]">
              Line {result.error.line}, column {result.error.column}
            </p>
            <Button size="sm" onClick={() => selectLine(result.error.line)} className="mt-3">
              Show in input
            </Button>
            {resultToJsonl && detectType(deferredText) === "jsonl" && (
              <p className="mt-3 text-xs text-[color:var(--text-muted)]">
                This looks like JSON Lines.{" "}
                <button type="button" onClick={() => setDirection("jsonl-to-json")} className="text-[color:var(--accent-text)] underline">
                  Convert JSONL → JSON instead
                </button>
              </p>
            )}
          </Alert>
        )}
      </OutputPanel>
    </>
  );
}

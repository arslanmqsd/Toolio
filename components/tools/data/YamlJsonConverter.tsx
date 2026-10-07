"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeTextArea, selectLine } from "@/components/ui/CodeField";
import ErrorCaret from "@/components/ui/ErrorCaret";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { readTextFile } from "@/lib/files/text-file";
import { jsonToYaml, yamlToJson, type Notice, type YamlVersion } from "@/lib/tools/data/yaml-json";

const EXAMPLE = `# Service settings
name: toolio
version: 1.10
country: NO
defaults: &defaults
  retries: 3
  timeout: 30
services:
  api:
    <<: *defaults
    port: 8080
    tags: [web, public]
  worker:
    <<: *defaults
    enabled: on
`;

type Direction = "yaml-to-json" | "json-to-yaml";

const DIRECTIONS = [
  { id: "yaml-to-json", label: "YAML → JSON" },
  { id: "json-to-yaml", label: "JSON → YAML" },
] as const;

const VERSIONS = [
  { id: "1.2", label: "YAML 1.2" },
  { id: "1.1", label: "YAML 1.1" },
] as const;

const JSON_INDENTS = [
  { id: "2", label: "2 spaces" },
  { id: "4", label: "4 spaces" },
  { id: "min", label: "Minify" },
] as const;

const YAML_INDENTS = [
  { id: "2", label: "2 spaces" },
  { id: "4", label: "4 spaces" },
] as const;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_NOTICES_SHOWN = 50;
const ERROR_ID = "yaml-json-error";
// Worth a second look; the rest only say what happened.
const WARNING_KINDS = new Set<Notice["kind"]>(["version", "number", "tag", "key", "duplicate"]);

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!/^[[{]/.test(t)) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

function directionForFile(name: string, text: string): Direction {
  if (/\.ya?ml$/i.test(name)) return "yaml-to-json";
  if (/\.json$/i.test(name)) return "json-to-yaml";
  return looksLikeJson(text) ? "json-to-yaml" : "yaml-to-json";
}

export default function YamlJsonConverter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [direction, setDirection] = useState<Direction>("yaml-to-json");
  const [text, setText] = useToolInput(EXAMPLE, (value) => {
    setFileBase(null);
    setDirection(looksLikeJson(value) ? "json-to-yaml" : "yaml-to-json");
  });
  const [version, setVersion] = useState<YamlVersion>("1.2");
  const [jsonIndent, setJsonIndent] = useState<(typeof JSON_INDENTS)[number]["id"]>("2");
  const [yamlIndent, setYamlIndent] = useState<(typeof YAML_INDENTS)[number]["id"]>("2");
  const [compat11, setCompat11] = useState(true);
  const [fileBase, setFileBase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();

  // Text and direction are deferred together: switching direction also swaps the text, and reading
  // the old text the new way would flash an error.
  const input = useMemo(() => ({ text, direction }), [text, direction]);
  const deferred = useDeferredValue(input);
  const toJson = deferred.direction === "yaml-to-json";
  const result = useMemo(
    () =>
      deferred.direction === "yaml-to-json"
        ? yamlToJson(deferred.text, { version, indent: jsonIndent === "min" ? "" : " ".repeat(Number(jsonIndent)) })
        : jsonToYaml(deferred.text, { indent: Number(yamlIndent), compat11 }),
    [deferred, version, jsonIndent, yamlIndent, compat11],
  );

  const inputType = direction === "yaml-to-json" ? "YAML" : "JSON";
  const empty = deferred.text.trim() === "";
  const output = result.ok && !empty ? result.output : undefined;
  const invalid = !result.ok && !empty;
  const notices = result.ok && !empty ? result.notices : [];
  const warnings = notices.filter((n) => WARNING_KINDS.has(n.kind));
  const info = notices.filter((n) => !WARNING_KINDS.has(n.kind));

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
              invalid={invalid}
              aria-describedby={invalid ? ERROR_ID : undefined}
              placeholder={direction === "yaml-to-json" ? "name: toolio\ntags: [web, api]" : '{"name": "toolio", "tags": ["web", "api"]}'}
            />
            <FileDrop compact accept=".yaml,.yml,.json,application/json,application/yaml" what="a .yaml or .json file" onFiles={([file]) => loadFile(file)} />
            {fileError && (
              <p role="alert" className="text-xs text-[color:var(--error)]">
                {fileError}
              </p>
            )}
          </div>
          {direction === "yaml-to-json" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl label="Read as" options={VERSIONS} value={version} onChange={setVersion} />
                <SegmentedControl label="JSON indent" options={JSON_INDENTS} value={jsonIndent} onChange={setJsonIndent} />
              </div>
              <p className="text-xs text-[color:var(--text-muted)]">
                1.2 is the current spec. 1.1 is how PyYAML and much older tooling read YAML, where no, on and yes are booleans.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <SegmentedControl label="YAML indent" options={YAML_INDENTS} value={yamlIndent} onChange={setYamlIndent} />
              <Checkbox checked={compat11} onChange={setCompat11}>
                Quote values YAML 1.1 would misread (no, on, 1:30), for PyYAML and older tools
              </Checkbox>
            </div>
          )}
        </div>
      </InputPanel>

      <OutputPanel
        label={toJson ? "JSON" : "YAML"}
        copyText={output}
        outputType={toJson ? "json" : "yaml"}
        download={{ filename: `${fileBase ?? "data"}.${toJson ? "json" : "yaml"}`, mimeType: toJson ? "application/json" : "application/yaml" }}
      >
        {empty ? (
          <Alert title="Nothing to convert" tone="warn">
            <p>Paste {direction === "yaml-to-json" ? "YAML" : "JSON"} into the input, or drop a file.</p>
            <Button
              size="sm"
              onClick={() => {
                setText(EXAMPLE);
                setDirection("yaml-to-json");
              }}
              className="mt-3"
            >
              Load example
            </Button>
          </Alert>
        ) : !result.ok ? (
          <Alert id={ERROR_ID} title={`Invalid ${toJson ? "YAML" : "JSON"}`}>
            <p>{result.error.message}</p>
            <p className="mt-3 text-xs text-[color:var(--text-muted)]">
              Line {result.error.line}, column {result.error.column}
            </p>
            <ErrorCaret line={deferred.text.split("\n")[result.error.line - 1] ?? ""} column={result.error.column} className="mt-2" />
            <Button size="sm" onClick={() => selectLine(inputRef.current, result.error.line)} className="mt-3">
              Show in input
            </Button>
            {toJson && looksLikeJson(deferred.text) && (
              <p className="mt-3 text-xs text-[color:var(--text-muted)]">
                This looks like JSON.{" "}
                <button type="button" onClick={() => setDirection("json-to-yaml")} className="text-[color:var(--accent-text)] underline">
                  Convert JSON → YAML instead
                </button>
              </p>
            )}
          </Alert>
        ) : (
          <>
            {warnings.length > 0 && (
              <div className="mb-4">
                <Alert tone="warn" title={warnings.length === 1 ? "1 thing to check" : `${warnings.length} things to check`}>
                  <ul className="mt-1 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-xs">
                    {warnings.slice(0, MAX_NOTICES_SHOWN).map((n, i) => (
                      <li key={i} className="contents">
                        {n.line === undefined ? (
                          <span />
                        ) : (
                          <button
                            type="button"
                            onClick={() => selectLine(inputRef.current, n.line!)}
                            className="justify-self-start font-medium tabular-nums text-[color:var(--accent-text)] underline"
                            aria-label={`Show line ${n.line} in input`}
                          >
                            Line {n.line}
                          </button>
                        )}
                        <span>{n.message}</span>
                      </li>
                    ))}
                  </ul>
                  {warnings.length > MAX_NOTICES_SHOWN && (
                    <p className="mt-2 text-xs text-[color:var(--text-muted)]">…and {(warnings.length - MAX_NOTICES_SHOWN).toLocaleString()} more.</p>
                  )}
                </Alert>
              </div>
            )}
            {info.length > 0 && (
              <ul className="mb-4 space-y-1 border-b border-[color:var(--border)] pb-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                {info.map((n, i) => (
                  <li key={i}>{n.message}</li>
                ))}
              </ul>
            )}
            <pre className="whitespace-pre">{output}</pre>
          </>
        )}
      </OutputPanel>
    </>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput, CodeTextArea, selectLine } from "@/components/ui/CodeField";
import ErrorLocation from "@/components/ui/ErrorLocation";
import FileDrop from "@/components/ui/FileDrop";
import LabelledControl from "@/components/ui/LabelledControl";
import SegmentedControl from "@/components/ui/SegmentedControl";
import ResultNotices from "@/components/ui/ResultNotices";
import { checkTextFile } from "@/lib/files/text-file";
import { useWorkerJob } from "@/lib/hooks/useWorkerJob";
import {
  DEFAULT_JSON_TO_XML,
  DEFAULT_XML_TO_JSON,
  TEXT_KEY,
  type AttributePrefix,
  type JsonToXmlOptions,
  type XmlJsonJobResult,
  type XmlJsonRequest,
  type XmlToJsonOptions,
} from "@/lib/tools/data/xml-json";
import { decodeXmlBytes } from "@/lib/tools/developer/xml-format";

const EXAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Book catalog -->
<catalog xmlns:dc="http://purl.org/dc/elements/1.1/">
  <book id="bk101" lang="en">
    <dc:title>XML Developer&apos;s Guide</dc:title>
    <author>Gambardella, Matthew</author>
    <author>Knorr, Eric</author>
    <price currency="USD">44.95</price>
    <summary>An <em>in-depth</em> look at XML.</summary>
  </book>
  <book id="bk102" lang="en">
    <dc:title>Midnight Rain</dc:title>
    <author>Ralls, Kim</author>
    <price currency="USD">5.95</price>
    <code><![CDATA[if (a < b && c > d) { open(); }]]></code>
  </book>
</catalog>
`;

const EXAMPLE_JSON = `{
  "order": {
    "@id": "A-1001",
    "@status": "shipped",
    "customer": { "name": "Ada Lovelace", "email": "ada@example.com" },
    "item": [
      { "@sku": "BK-1", "title": "Notes on the Engine", "qty": 2, "price": 12.50 },
      { "@sku": "BK-2", "title": "Rock & Roll <Live>", "qty": 1, "price": 9.99 }
    ],
    "gift": true,
    "note": null
  }
}
`;

type Direction = XmlJsonRequest["direction"];

const DIRECTIONS = [
  { id: "xml-to-json", label: "XML → JSON" },
  { id: "json-to-xml", label: "JSON → XML" },
] as const;

const PREFIXES = [
  { id: "@", label: "@id" },
  { id: "_", label: "_id" },
  { id: "$", label: "$id" },
  { id: "", label: "id" },
] as const;

const INDENTS = [
  { id: "2", label: "2 spaces" },
  { id: "4", label: "4 spaces" },
  { id: "tab", label: "Tab" },
  { id: "min", label: "Minify" },
] as const;

const JSON_INDENTS = INDENTS.filter((i) => i.id !== "tab");

type Indent = (typeof INDENTS)[number]["id"];

const indentText = (indent: Indent) => (indent === "min" ? "" : indent === "tab" ? "\t" : " ".repeat(Number(indent)));

const TIMEOUT_MS = 20_000;
const DEBOUNCE_MS = 200;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SNIFF_BYTES = 8192;
const ERROR_ID = "xml-json-error";
const ROOT_ID = "xml-json-root";
const FILE_TYPES = ".xml,.json,.svg,.rss,.atom,.xsd,.wsdl,.plist,.config,.csproj,.kml,.gpx,application/xml,text/xml,application/json";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/data/xml-json.worker.ts", import.meta.url));
}

/** XML starts with <, JSON with { or [; anything else keeps the direction it has. */
function directionOf(text: string, current: Direction): Direction {
  const first = text.trimStart()[0];
  if (first === "<") return "xml-to-json";
  if (first === "{" || first === "[") return "json-to-xml";
  return current;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default function XmlJsonConverter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [direction, setDirection] = useState<Direction>("xml-to-json");
  const [text, setText] = useToolInput(EXAMPLE_XML, (value) => {
    setFileBase(null);
    setDirection((d) => directionOf(value, d));
  });
  // One prefix for both directions, so a round trip gives the same attributes back.
  const [prefix, setPrefix] = useState<AttributePrefix>(DEFAULT_XML_TO_JSON.attributePrefix);
  const [readOptions, setReadOptions] = useState<Omit<XmlToJsonOptions, "attributePrefix" | "indent">>(DEFAULT_XML_TO_JSON);
  const [writeOptions, setWriteOptions] = useState<Omit<JsonToXmlOptions, "attributePrefix" | "indent">>(DEFAULT_JSON_TO_XML);
  const [jsonIndent, setJsonIndent] = useState<Indent>("2");
  const [xmlIndent, setXmlIndent] = useState<Indent>("2");
  const [fileBase, setFileBase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();

  const empty = text.trim() === "";
  const toJson = direction === "xml-to-json";
  const request = useMemo<XmlJsonRequest | null>(() => {
    if (empty) return null;
    if (toJson) return { direction: "xml-to-json", text, options: { ...readOptions, attributePrefix: prefix, indent: indentText(jsonIndent) } };
    return { direction: "json-to-xml", text, options: { ...writeOptions, attributePrefix: prefix, indent: indentText(xmlIndent) } };
  }, [empty, toJson, text, readOptions, writeOptions, prefix, jsonIndent, xmlIndent]);
  const state = useWorkerJob<XmlJsonRequest, XmlJsonJobResult>(createWorker, request, { timeoutMs: TIMEOUT_MS, debounceMs: DEBOUNCE_MS });
  // The last result stays up while the next one is worked out, but not one for the other direction.
  const result = state.status === "done" && state.result.direction === direction ? state.result : null;
  const output = result?.ok ? result.output : undefined;
  const invalid = !empty && result !== null && !result.ok;
  const inputType = toJson ? "XML" : "JSON";
  const otherType = toJson ? "JSON" : "XML";

  const setRead = <K extends keyof XmlToJsonOptions>(key: K, value: XmlToJsonOptions[K]) => setReadOptions((o) => ({ ...o, [key]: value }));
  const setWrite = <K extends keyof JsonToXmlOptions>(key: K, value: JsonToXmlOptions[K]) => setWriteOptions((o) => ({ ...o, [key]: value }));

  function changeDirection(next: Direction) {
    // Carry the result over so the round trip is one click.
    if (output) setText(output);
    setDirection(next);
  }

  async function loadFile(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // UTF-16 text is full of zero bytes, so only look for binary in files without its byte order mark.
      const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
      const error = checkTextFile(file.size, utf16 ? new Uint8Array() : bytes.subarray(0, SNIFF_BYTES), MAX_FILE_BYTES);
      if (error) {
        setFileError(error);
        return;
      }
      setFileError(undefined);
      const loaded = decodeXmlBytes(bytes);
      setText(loaded);
      setFileBase(file.name.replace(/\.[^.]+$/, "") || null);
      setDirection(/\.json$/i.test(file.name) ? "json-to-xml" : directionOf(loaded, "xml-to-json"));
    } catch {
      setFileError("The browser couldn't read this file.");
    }
  }

  function clear() {
    setText("");
    inputRef.current?.focus();
  }

  const example = toJson ? EXAMPLE_XML : EXAMPLE_JSON;
  const download = output
    ? toJson
      ? { filename: `${fileBase ?? "data"}.json`, mimeType: "application/json" }
      : { filename: `${fileBase ?? "data"}.xml`, mimeType: "application/xml" }
    : undefined;
  // Only the first character is checked, so the hint costs nothing on a large input.
  const looksOther = !empty && directionOf(text, direction) !== direction;

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
              placeholder={toJson ? "<user><name>Ada</name></user>" : '{"user": {"name": "Ada"}}'}
            />
            <FileDrop compact accept={FILE_TYPES} what="an .xml or .json file" onFiles={([file]) => loadFile(file)} />
            {fileError && (
              <p role="alert" className="text-xs text-[color:var(--error)]">
                {fileError}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <LabelledControl label="Attributes">
              <SegmentedControl label="Attribute keys" options={PREFIXES} value={prefix} onChange={setPrefix} />
            </LabelledControl>
            {toJson ? (
              <>
                <LabelledControl label="JSON indent">
                  <SegmentedControl label="JSON indent" options={JSON_INDENTS} value={jsonIndent} onChange={setJsonIndent} />
                </LabelledControl>
                <Checkbox checked={readOptions.alwaysArrays} onChange={(v) => setRead("alwaysArrays", v)}>
                  Always use arrays, so an element that appears once has the same shape as one that repeats
                </Checkbox>
                <Checkbox checked={readOptions.inferTypes} onChange={(v) => setRead("inferTypes", v)}>
                  Read numbers, true/false and null as values (007 and 1e5 stay text)
                </Checkbox>
                <Checkbox checked={readOptions.stripNamespaces} onChange={(v) => setRead("stripNamespaces", v)}>
                  Drop namespace prefixes (dc:title becomes title)
                </Checkbox>
                <Checkbox checked={readOptions.trimText} onChange={(v) => setRead("trimText", v)}>
                  Trim whitespace around text
                </Checkbox>
                <p className="text-xs text-[color:var(--text-muted)]">
                  Text beside attributes or elements goes in {TEXT_KEY}. Entities other than the five built into XML are kept as written, never expanded.
                </p>
              </>
            ) : (
              <>
                <LabelledControl label="Indent">
                  <SegmentedControl label="XML indent" options={INDENTS} value={xmlIndent} onChange={setXmlIndent} />
                </LabelledControl>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={ROOT_ID} className="text-sm text-[color:var(--text-muted)]">
                      Root element
                    </label>
                    <CodeInput
                      id={ROOT_ID}
                      value={writeOptions.rootName}
                      onChange={(e) => setWrite("rootName", e.target.value)}
                      placeholder="root"
                      aria-describedby={`${ROOT_ID}-help`}
                      className="w-40 py-1.5"
                    />
                  </div>
                  <p id={`${ROOT_ID}-help`} className="text-xs text-[color:var(--text-muted)]">
                    Used when the JSON isn&apos;t one object with a single key.
                  </p>
                </div>
                <Checkbox checked={writeOptions.declaration} onChange={(v) => setWrite("declaration", v)}>
                  Start with an XML declaration
                </Checkbox>
                <p className="text-xs text-[color:var(--text-muted)]">
                  Keys starting with {prefix === "" ? "a prefix (choose one above)" : prefix} become attributes, {TEXT_KEY} becomes text, and each item of an array repeats the element.
                </p>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={clear} disabled={text === ""}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setText(example)} disabled={text === example}>
              Load example
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label={otherType} copyText={empty ? undefined : output} outputType={toJson ? "json" : "xml"} download={download}>
        {empty ? (
          <Alert title="Nothing to convert" tone="warn">
            <p>Paste {inputType} into the input, or drop a file.</p>
            <Button size="sm" onClick={() => setText(example)} className="mt-3">
              Load example
            </Button>
          </Alert>
        ) : (
          <>
            {looksOther && (
              <p className="mb-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                This looks like {otherType}.{" "}
                <button type="button" onClick={() => setDirection(directionOf(text, direction))} className="text-[color:var(--accent-text)] underline">
                  Convert {otherType} → {inputType} instead
                </button>
              </p>
            )}
            <ConversionResult state={state} result={result} inputType={inputType} inputText={text} inputRef={inputRef} />
          </>
        )}
      </OutputPanel>
    </>
  );
}

interface ConversionResultProps {
  state: ReturnType<typeof useWorkerJob<XmlJsonRequest, XmlJsonJobResult>>;
  result: XmlJsonJobResult | null;
  inputType: string;
  inputText: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

function ConversionResult({ state, result, inputType, inputText, inputRef }: ConversionResultProps) {
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
  if (!result) return <p className="font-[family-name:var(--font-ui)] text-sm text-[color:var(--text-muted)]">Working…</p>;

  if (!result.ok) {
    const { message, line, column } = result.error;
    return (
      <Alert id={ERROR_ID} title={inputType === "XML" ? "This XML isn't well-formed" : "Invalid JSON"}>
        <p>{message}</p>
        <ErrorLocation source={inputText} line={line} column={column} onShow={() => selectLine(inputRef.current, line)} />
      </Alert>
    );
  }

  const { stats } = result;
  return (
    <>
      <p className="mb-4 font-[family-name:var(--font-ui)] text-xs tabular-nums text-[color:var(--text-muted)]">
        {count(stats.elements, "element", "elements")} · {count(stats.attributes, "attribute", "attributes")} · {count(stats.depth, "level", "levels")} deep
      </p>
      <ResultNotices notices={result.notices} />
      <pre className="whitespace-pre [tab-size:4]">{result.output}</pre>
    </>
  );
}

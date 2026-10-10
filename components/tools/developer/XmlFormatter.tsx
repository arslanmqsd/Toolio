"use client";

import { useMemo, useRef, useState } from "react";
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
import SizeSummary from "@/components/ui/SizeSummary";
import ThingsToCheck from "@/components/ui/ThingsToCheck";
import ValidSummary from "@/components/ui/ValidSummary";
import { checkTextFile } from "@/lib/files/text-file";
import { useWorkerJob } from "@/lib/hooks/useWorkerJob";
import { DEFAULT_XML_OPTIONS, decodeXmlBytes, type XmlJobResult, type XmlOptions, type XmlRequest } from "@/lib/tools/developer/xml-format";

const EXAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Book catalog -->
<catalog xmlns="urn:toolio:catalog" xmlns:dc="http://purl.org/dc/elements/1.1/">
<book id="bk101" lang="en"><dc:title>XML Developer&apos;s Guide</dc:title><author>Gambardella, Matthew</author>
<price currency="USD">44.95</price><summary>An <em>in-depth</em> look at building applications with XML.</summary></book>
<book id="bk102" lang="en"><dc:title>Midnight Rain</dc:title><author>Ralls, Kim</author><price currency="USD">5.95</price>
<script><![CDATA[if (a < b && c > d) { open(); }]]></script></book>
</catalog>
`;

const MODES = [
  { id: "format", label: "Format" },
  { id: "minify", label: "Minify" },
] as const;

const INDENTS = [
  { id: "2", label: "2 spaces" },
  { id: "4", label: "4 spaces" },
  { id: "tab", label: "Tab" },
] as const;

const TIMEOUT_MS = 15_000;
const DEBOUNCE_MS = 200;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SNIFF_BYTES = 8192;
const ERROR_ID = "xml-format-error";
const FILE_TYPES = ".xml,.svg,.xsd,.xsl,.xslt,.rss,.atom,.wsdl,.plist,.config,.csproj,.resx,.gpx,.kml,application/xml,text/xml,image/svg+xml";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/developer/xml-format.worker.ts", import.meta.url));
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default function XmlFormatter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useToolInput(EXAMPLE, () => setFile(null));
  const [mode, setMode] = useState<XmlRequest["mode"]>("format");
  const [options, setOptions] = useState<XmlOptions>(DEFAULT_XML_OPTIONS);
  // The loaded file's name, so a download keeps its extension: .svg stays .svg.
  const [file, setFile] = useState<{ base: string; extension: string } | null>(null);
  const [fileError, setFileError] = useState<string>();

  const empty = text.trim() === "";
  const request = useMemo<XmlRequest | null>(() => (empty ? null : { text, mode, options }), [empty, text, mode, options]);
  const state = useWorkerJob<XmlRequest, XmlJobResult>(createWorker, request, { timeoutMs: TIMEOUT_MS, debounceMs: DEBOUNCE_MS });
  // The last result stays up while the next one is worked out.
  const result = state.status === "done" ? state.result : null;
  const output = result?.ok ? result.output : undefined;
  const invalid = !empty && result !== null && !result.ok;
  const shownMode = result?.mode ?? mode;

  const setOption = <K extends keyof XmlOptions>(key: K, value: XmlOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));

  async function loadFile(dropped: File) {
    try {
      const bytes = new Uint8Array(await dropped.arrayBuffer());
      // UTF-16 text is full of zero bytes, so only look for binary in files without its byte order mark.
      const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
      const error = checkTextFile(dropped.size, utf16 ? new Uint8Array() : bytes.subarray(0, SNIFF_BYTES), MAX_FILE_BYTES);
      if (error) {
        setFileError(error);
        return;
      }
      setFileError(undefined);
      setText(decodeXmlBytes(bytes));
      const dot = dropped.name.lastIndexOf(".");
      setFile(dot > 0 ? { base: dropped.name.slice(0, dot), extension: dropped.name.slice(dot) } : { base: dropped.name || "document", extension: ".xml" });
    } catch {
      setFileError("The browser couldn't read this file.");
    }
  }

  function clear() {
    setText("");
    inputRef.current?.focus();
  }

  return (
    <>
      <InputPanel label="XML">
        <div className="space-y-4">
          <SegmentedControl label="Mode" options={MODES} value={mode} onChange={setMode} />
          <div className="space-y-2">
            <CodeTextArea
              ref={inputRef}
              aria-label="XML input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              invalid={invalid}
              aria-describedby={invalid ? ERROR_ID : undefined}
              placeholder="<note><to>Ada</to></note>"
            />
            <FileDrop compact accept={FILE_TYPES} what="an .xml, .svg or other XML file" onFiles={([dropped]) => loadFile(dropped)} />
            {fileError && (
              <p role="alert" className="text-xs text-[color:var(--error)]">
                {fileError}
              </p>
            )}
          </div>

          {mode === "format" ? (
            <div className="space-y-3">
              <LabelledControl label="Indent">
                <SegmentedControl label="Indent" options={INDENTS} value={options.indent} onChange={(v) => setOption("indent", v)} />
              </LabelledControl>
              <Checkbox checked={options.attributesPerLine} onChange={(v) => setOption("attributesPerLine", v)}>
                Put each attribute on its own line (elements with 2 or more)
              </Checkbox>
              <Checkbox checked={options.sortAttributes} onChange={(v) => setOption("sortAttributes", v)}>
                Sort attributes A to Z, namespace declarations first
              </Checkbox>
              <p className="text-xs text-[color:var(--text-muted)]">
                Only the whitespace between tags changes. Text, CDATA and anything under xml:space=&quot;preserve&quot; stay exactly as written.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Checkbox checked={options.removeComments} onChange={(v) => setOption("removeComments", v)}>
                Remove comments
              </Checkbox>
              <p className="text-xs text-[color:var(--text-muted)]">
                Whitespace between tags is removed. Text, CDATA and anything under xml:space=&quot;preserve&quot; stay exactly as written.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={clear} disabled={text === ""}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setText(EXAMPLE)} disabled={text === EXAMPLE}>
              Load example
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label={shownMode === "minify" ? "Minified" : "Formatted"}
        copyText={empty ? undefined : output}
        outputType="xml"
        download={{ filename: `${file?.base ?? "document"
          }${shownMode === "minify" ? ".min" : ""}${file?.extension ?? ".xml"}`, mimeType: "application/xml" }}
      >
        {empty ? (
          <Alert title="Nothing to check" tone="warn">
            <p>Paste XML into the input, or drop a file.</p>
            <Button size="sm" onClick={() => setText(EXAMPLE)} className="mt-3">
              Load example
            </Button>
          </Alert>
        ) : (
          <XmlResult state={state} inputText={text} inputRef={inputRef} />
        )}
      </OutputPanel>
    </>
  );
}

interface XmlResultProps {
  state: ReturnType<typeof useWorkerJob<XmlRequest, XmlJobResult>>;
  inputText: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

function XmlResult({ state, inputText, inputRef }: XmlResultProps) {
  if (state.status === "pending") return <p className="font-[family-name:var(--font-ui)] text-sm text-[color:var(--text-muted)]">Working…</p>;
  if (state.status === "timeout") {
    return (
      <Alert title="This took too long">
        <p>The document is too big to check here, so it was stopped. Try a smaller part of it.</p>
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
      <Alert id={ERROR_ID} title="This XML isn't well-formed">
        <p>{message}</p>
        <ErrorLocation source={inputText} line={line} column={column} onShow={() => selectLine(inputRef.current, line)} />
      </Alert>
    );
  }

  const { stats } = result;
  return (
    <>
      <ValidSummary
        title="Well-formed XML"
        items={[
          ["Root", <code key="root">&lt;{stats.root}&gt;</code>],
          ["Elements", stats.elements.toLocaleString("en-US")],
          ["Attributes", stats.attributes.toLocaleString("en-US")],
          ["Depth", count(stats.depth, "level", "levels")],
        ]}
      >
        <p className="text-[color:var(--text-muted)]">Checked for well-formedness only, not against a schema (XSD) or DTD.</p>
      </ValidSummary>
      <SizeSummary sizes={result.sizes} />
      <ThingsToCheck items={result.notices} />
      <pre className={`[tab-size:4] ${result.mode === "minify" ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>{result.output}</pre>
    </>
  );
}

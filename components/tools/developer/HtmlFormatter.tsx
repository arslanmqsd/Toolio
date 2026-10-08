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
import HtmlPreview from "@/components/ui/HtmlPreview";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { formatBytes } from "@/lib/format-bytes";
import { readTextFile } from "@/lib/files/text-file";
import { useWorkerJob } from "@/lib/hooks/useWorkerJob";
import {
  DEFAULT_FORMAT,
  DEFAULT_MINIFY,
  type FormatOptions,
  type HtmlJobResult,
  type HtmlRequest,
  type HtmlSizes,
  type MinifyOptions,
} from "@/lib/tools/developer/html-format";

const EXAMPLE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Toolio</title>
<style>body { font-family: system-ui, sans-serif; margin: 2rem; } nav a { margin-right: 1rem; } .note { color: #555; }</style>
</head>
<body><!-- Site navigation --><nav><a href="/">Home</a><a href="/tools">Tools</a><a href="/about">About</a></nav>
<h1>Hello, <em>world</em></h1><p class="note">Every tool runs in your browser. <strong>Nothing</strong> is uploaded.</p>
<ul><li>Format</li><li>Minify</li><li>Preview</li></ul>
<pre>  Spacing in pre
    stays exactly as written.</pre>
<script>function greet ( name ) { return "Hello, " + name }</script>
</body></html>
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

const WIDTHS = [
  { id: "80", label: "80" },
  { id: "100", label: "100" },
  { id: "120", label: "120" },
] as const;

const WHITESPACE = [
  { id: "safe", label: "Collapse" },
  { id: "aggressive", label: "Remove" },
  { id: "keep", label: "Keep" },
] as const;

const WHITESPACE_HELP: Record<MinifyOptions["whitespace"], string> = {
  safe: "Runs of spaces and line breaks become one space. The page renders the same.",
  aggressive: "Also removes spaces between block tags. Can close gaps between inline-block elements, like buttons in a row.",
  keep: "Whitespace stays as written.",
};

const VIEWS = [
  { id: "code", label: "Code" },
  { id: "preview", label: "Preview" },
] as const;

const DEVICES = [
  { id: "full", label: "Full width" },
  { id: "tablet", label: "Tablet" },
  { id: "phone", label: "Phone" },
] as const;

const DEVICE_WIDTHS: Record<(typeof DEVICES)[number]["id"], number | undefined> = { full: undefined, tablet: 768, phone: 375 };

// Prettier and the minifier load and warm up on the first run; a huge page can take a few seconds.
const TIMEOUT_MS = 15_000;
const DEBOUNCE_MS = 200;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ERROR_ID = "html-format-error";

/** A segmented control with its name shown beside it, for options whose choices don't explain themselves. */
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="text-sm text-[color:var(--text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function createWorker() {
  return new Worker(new URL("../../../lib/tools/developer/html-format.worker.ts", import.meta.url));
}

const percentSaved = (before: number, after: number) => (before === 0 ? 0 : Math.round((1 - after / before) * 100));

function SizeSummary({ sizes }: { sizes: HtmlSizes }) {
  const saved = percentSaved(sizes.input, sizes.output);
  return (
    <p className="mb-4 font-[family-name:var(--font-ui)] text-xs tabular-nums text-[color:var(--text-muted)]">
      {formatBytes(sizes.input)} → <span className="font-medium text-[color:var(--text)]">{formatBytes(sizes.output)}</span>
      {saved > 0 && <> ({saved}% smaller)</>}
      {saved < 0 && <> ({-saved}% larger)</>}
      <span aria-hidden="true"> · </span>
      <span className="whitespace-nowrap">
        gzipped {formatBytes(sizes.inputGzip)} → {formatBytes(sizes.outputGzip)}
      </span>
    </p>
  );
}

export default function HtmlFormatter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useToolInput(EXAMPLE, () => setFileBase(null));
  const [mode, setMode] = useState<HtmlRequest["mode"]>("format");
  const [format, setFormat] = useState<FormatOptions>(DEFAULT_FORMAT);
  const [minify, setMinify] = useState<MinifyOptions>(DEFAULT_MINIFY);
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("code");
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("full");
  const [fileBase, setFileBase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();

  const empty = text.trim() === "";
  const request = useMemo<HtmlRequest | null>(() => (empty ? null : { text, mode, format, minify }), [empty, text, mode, format, minify]);
  const state = useWorkerJob<HtmlRequest, HtmlJobResult>(createWorker, request, { timeoutMs: TIMEOUT_MS, debounceMs: DEBOUNCE_MS });
  // The last result stays up while the next one is worked out.
  const result = state.status === "done" ? state.result : null;
  const output = result?.ok ? result.output : undefined;
  const previewHtml = useDeferredValue(text);

  const setFormatOption = <K extends keyof FormatOptions>(key: K, value: FormatOptions[K]) => setFormat((f) => ({ ...f, [key]: value }));
  const setMinifyOption = <K extends keyof MinifyOptions>(key: K, value: MinifyOptions[K]) => setMinify((m) => ({ ...m, [key]: value }));

  async function loadFile(file: File) {
    const read = await readTextFile(file, MAX_FILE_BYTES);
    if (!read.ok) {
      setFileError(read.error);
      return;
    }
    setFileError(undefined);
    setText(read.text);
    setFileBase(file.name.replace(/\.[^.]+$/, "") || null);
  }

  function clear() {
    setText("");
    inputRef.current?.focus();
  }

  const invalid = !empty && result !== null && !result.ok;

  return (
    <>
      <InputPanel label="HTML">
        <div className="space-y-4">
          <SegmentedControl label="Mode" options={MODES} value={mode} onChange={setMode} />
          <div className="space-y-2">
            <CodeTextArea
              ref={inputRef}
              aria-label="HTML input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              invalid={invalid}
              aria-describedby={invalid ? ERROR_ID : undefined}
              placeholder="<p>Paste <b>HTML</b> here.</p>"
            />
            <FileDrop compact accept=".html,.htm,text/html" what="an .html file" onFiles={([file]) => loadFile(file)} />
            {fileError && (
              <p role="alert" className="text-xs text-[color:var(--error)]">
                {fileError}
              </p>
            )}
          </div>

          {mode === "format" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Labelled label="Indent">
                  <SegmentedControl label="Indent" options={INDENTS} value={format.indent} onChange={(v) => setFormatOption("indent", v)} />
                </Labelled>
                <Labelled label="Line width">
                  <SegmentedControl
                    label="Line width"
                    options={WIDTHS}
                    value={String(format.printWidth) as (typeof WIDTHS)[number]["id"]}
                    onChange={(v) => setFormatOption("printWidth", Number(v))}
                  />
                </Labelled>
              </div>
              <Checkbox checked={format.formatEmbedded} onChange={(v) => setFormatOption("formatEmbedded", v)}>
                Format the CSS and JavaScript in &lt;style&gt; and &lt;script&gt;
              </Checkbox>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Labelled label="Whitespace">
                  <SegmentedControl label="Whitespace" options={WHITESPACE} value={minify.whitespace} onChange={(v) => setMinifyOption("whitespace", v)} />
                </Labelled>
                <p className="text-xs text-[color:var(--text-muted)]">{WHITESPACE_HELP[minify.whitespace]}</p>
              </div>
              <Checkbox checked={minify.removeComments} onChange={(v) => setMinifyOption("removeComments", v)}>
                Remove comments (keeps &lt;!--[if IE]&gt; and &lt;!--! … --&gt;)
              </Checkbox>
              <Checkbox checked={minify.minifyCss} onChange={(v) => setMinifyOption("minifyCss", v)}>
                Minify CSS in &lt;style&gt; and style=&quot;…&quot;
              </Checkbox>
              <Checkbox checked={minify.minifyJs} onChange={(v) => setMinifyOption("minifyJs", v)}>
                Minify JavaScript in &lt;script&gt; and event attributes
              </Checkbox>
              <Checkbox checked={minify.removeOptional} onChange={(v) => setMinifyOption("removeOptional", v)}>
                Drop optional closing tags and attribute quotes (&lt;/li&gt;, &lt;/p&gt;, class=a)
              </Checkbox>
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
        label={(result?.mode ?? mode) === "minify" ? "Minified" : "Formatted"}
        copyText={empty ? undefined : output}
        outputType="html"
        download={{ filename: `${fileBase ?? "page"}${(result?.mode ?? mode) === "minify" ? ".min" : ""}.html`, mimeType: "text/html" }}
      >
        {empty ? (
          <Alert title="Nothing to format" tone="warn">
            <p>Paste HTML into the input, or drop a file.</p>
            <Button size="sm" onClick={() => setText(EXAMPLE)} className="mt-3">
              Load example
            </Button>
          </Alert>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3 font-[family-name:var(--font-ui)]">
              <SegmentedControl label="Output view" options={VIEWS} value={view} onChange={setView} />
              {view === "preview" && <SegmentedControl label="Preview width" options={DEVICES} value={device} onChange={setDevice} />}
            </div>
            {view === "preview" ? (
              <>
                <p className="mb-3 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                  Scripts, forms and frames are disabled. Images load from their own sites; nothing else is fetched.
                </p>
                <div className="overflow-x-auto">
                  <HtmlPreview html={previewHtml} styling="page" width={DEVICE_WIDTHS[device]} className="mx-auto block" />
                </div>
              </>
            ) : (
              <CodeResult state={state} inputText={text} inputRef={inputRef} onMinify={() => setMode("minify")} />
            )}
          </>
        )}
      </OutputPanel>
    </>
  );
}

interface CodeResultProps {
  state: ReturnType<typeof useWorkerJob<HtmlRequest, HtmlJobResult>>;
  inputText: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onMinify: () => void;
}

function CodeResult({ state, inputText, inputRef, onMinify }: CodeResultProps) {
  const muted = "font-[family-name:var(--font-ui)] text-sm text-[color:var(--text-muted)]";
  if (state.status === "pending") return <p className={muted}>Working…</p>;
  if (state.status === "timeout") {
    return (
      <Alert title="This took too long">
        <p>The page is too big to process here, so it was stopped. Try a smaller part of it.</p>
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
      <Alert id={ERROR_ID} title={result.mode === "format" ? "Couldn't format this HTML" : "Couldn't minify this HTML"}>
        <p>{message}</p>
        <p className="mt-3 text-xs text-[color:var(--text-muted)]">
          Line {line}, column {column}
        </p>
        <ErrorCaret line={inputText.split("\n")[line - 1] ?? ""} column={column} className="mt-2" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => selectLine(inputRef.current, line)}>
            Show in input
          </Button>
          {result.mode === "format" && (
            <Button size="sm" onClick={onMinify}>
              Minify instead
            </Button>
          )}
        </div>
        {result.mode === "format" && (
          <p className="mt-3 text-xs text-[color:var(--text-muted)]">
            Browsers forgive tags that don&apos;t match up, but formatting needs them to. Minifying works on it as is.
          </p>
        )}
      </Alert>
    );
  }

  return (
    <>
      <SizeSummary sizes={result.sizes} />
      {result.notices.length > 0 && (
        <div className="mb-4">
          <Alert tone="warn" title={result.notices.length === 1 ? "1 thing to check" : `${result.notices.length} things to check`}>
            <ul className="mt-1 space-y-1.5 text-xs">
              {result.notices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      <pre className={`[tab-size:4] ${result.mode === "minify" ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>{result.output}</pre>
    </>
  );
}

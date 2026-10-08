"use client";

import { useDeferredValue, useMemo, useState } from "react";
import ExamplePicker from "@/components/tool-shell/ExamplePicker";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import { detectType } from "@/components/workbench/detectors";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeTextArea } from "@/components/ui/CodeField";
import FileDrop from "@/components/ui/FileDrop";
import HtmlPreview from "@/components/ui/HtmlPreview";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { formatBytes } from "@/lib/format-bytes";
import { readTextFile } from "@/lib/files/text-file";
import { convert, markdownToHtml, textStats, type Direction, type LossReport } from "@/lib/tools/text/markdown-html";

const HELLO = "# Hello\nThis is **Toolio**.";

const EXAMPLES = [
  {
    id: "readme",
    label: "README",
    markdown: `# my-project

A small library that does one thing well.

## Install

\`\`\`bash
npm install my-project
\`\`\`

## Usage

\`\`\`ts
import { greet } from "my-project";

greet("Ada"); // "Hello, Ada!"
\`\`\`

See the [docs](https://example.com/docs) for more. Licensed under **MIT**.
`,
  },
  {
    id: "table",
    label: "Table",
    markdown: `| Tool | Language | Stars |
| :--- | :------- | ----: |
| marked | JavaScript | 33k |
| turndown | JavaScript | 9k |
| pandoc | Haskell | 34k |
`,
  },
  {
    id: "tasks",
    label: "Task list",
    markdown: `## Release checklist

- [x] Update the changelog
- [x] Bump the version
- [ ] Tag the release
- [ ] ~~Email the team~~ Post in the channel
`,
  },
] as const;

const DIRECTIONS = [
  { id: "md-to-html", label: "Markdown → HTML" },
  { id: "html-to-md", label: "HTML → Markdown" },
] as const;

type View = "code" | "preview";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ERROR_ID = "markdown-html-error";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function directionForFile(name: string): Direction | null {
  if (/\.(md|markdown|mdown|mkd)$/i.test(name)) return "md-to-html";
  if (/\.html?$/i.test(name)) return "html-to-md";
  return null;
}

const directionFor = (text: string): Direction => (detectType(text) === "html" ? "html-to-md" : "md-to-html");

/** The example in the input's language: Markdown as written, or the HTML it converts to. */
function exampleText(example: { markdown: string }, direction: Direction): string {
  if (direction === "md-to-html") return example.markdown;
  const html = markdownToHtml(example.markdown);
  return html.ok ? html.output : example.markdown;
}

/** True when replacing `text` loses nothing the user wrote: it's empty or one of our examples. */
function isDisposable(text: string): boolean {
  if (text.trim() === "") return true;
  return [{ markdown: HELLO }, ...EXAMPLES].some((ex) => DIRECTIONS.some((d) => exampleText(ex, d.id) === text));
}

function LossWarning({ lossy }: { lossy: LossReport }) {
  return (
    <div className="mb-4">
      <Alert tone="warn" title="Some HTML features could not be represented exactly in Markdown">
        <ul className="mt-1 space-y-1 text-xs">
          {lossy.keptAsHtml.length > 0 && (
            <li>
              <span className="font-medium">Kept as raw HTML:</span> <code>{lossy.keptAsHtml.join(", ")}</code>
            </li>
          )}
          {lossy.removed.length > 0 && (
            <li>
              <span className="font-medium">Removed:</span> <code>{lossy.removed.join(", ")}</code>
            </li>
          )}
        </ul>
      </Alert>
    </div>
  );
}

export default function MarkdownHtmlConverter() {
  const [text, setText] = useToolInput(HELLO, (value) => {
    setFileBase(null);
    setDirection(directionFor(value));
  });
  const [direction, setDirection] = useState<Direction>("md-to-html");
  const [view, setView] = useState<View>("code");
  const [fileBase, setFileBase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();

  // Text and direction are deferred together, so a direction switch never reads the old text the new way.
  const input = useMemo(() => ({ text, direction }), [text, direction]);
  const deferred = useDeferredValue(input);
  const result = useMemo(() => convert(deferred.text, deferred.direction), [deferred]);
  const stats = useMemo(() => textStats(text), [text]);

  const toHtml = direction === "md-to-html";
  const inputType = toHtml ? "Markdown" : "HTML";
  // The output panel follows the result it's showing, not the toggle.
  const resultToHtml = deferred.direction === "md-to-html";
  const outputType = resultToHtml ? "html" : "markdown";
  const outputLabel = resultToHtml ? "HTML" : "Markdown";
  const empty = deferred.text.trim() === "";
  const output = result.ok && result.output ? result.output : undefined;
  // The preview always renders the HTML side: the output going to HTML, the input coming from it.
  const previewHtml = resultToHtml ? (output ?? "") : deferred.text;
  const lossy = result.ok && (result.lossy.keptAsHtml.length > 0 || result.lossy.removed.length > 0) ? result.lossy : null;

  const views = useMemo(
    () => [
      { id: "code", label: outputLabel },
      { id: "preview", label: "Preview" },
    ] as const,
    [outputLabel],
  );

  function changeDirection(next: Direction) {
    // Carry the result over so the round trip is one click.
    if (result.ok && result.output) setText(result.output);
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
    setDirection(directionForFile(file.name) ?? directionFor(read.text));
  }

  return (
    <>
      <InputPanel label={inputType}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <SegmentedControl label="Direction" options={DIRECTIONS} value={direction} onChange={changeDirection} />
            <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs text-[color:var(--text-muted)]">
              GitHub Flavored Markdown
            </span>
          </div>

          <ExamplePicker
            examples={EXAMPLES}
            hasUserInput={() => !isDisposable(text)}
            onLoad={(example) => {
              setText(exampleText(example, direction));
              setFileBase(null);
            }}
          />

          <div className="space-y-2">
            <CodeTextArea
              aria-label={`${inputType} input`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              invalid={!result.ok && !empty}
              aria-describedby={!result.ok && !empty ? ERROR_ID : undefined}
              placeholder={toHtml ? "# Title\n\nSome **bold** text." : "<h1>Title</h1>\n<p>Some <strong>bold</strong> text.</p>"}
            />
            <p className="text-xs tabular-nums text-[color:var(--text-muted)]">
              {formatBytes(stats.bytes)} · {plural(stats.words, "word")} · {plural(stats.lines, "line")}
            </p>
            <FileDrop
              compact
              accept=".md,.markdown,.html,.htm,text/markdown,text/html"
              what="a .md or .html file"
              onFiles={([file]) => loadFile(file)}
            />
            {fileError && (
              <p role="alert" className="text-xs text-[color:var(--error)]">
                {fileError}
              </p>
            )}
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label={outputLabel}
        copyText={output}
        outputType={outputType}
        download={{
          filename: `${fileBase ?? "converted"}.${resultToHtml ? "html" : "md"}`,
          mimeType: resultToHtml ? "text/html" : "text/markdown",
        }}
      >
        {result.ok && !empty ? (
          <>
            {lossy && <LossWarning lossy={lossy} />}
            <div className="mb-4 font-[family-name:var(--font-ui)]">
              <SegmentedControl label="Output view" options={views} value={view} onChange={setView} />
            </div>
            {view === "preview" ? <HtmlPreview html={previewHtml} styling="prose" /> : <pre className="whitespace-pre-wrap break-words">{output}</pre>}
          </>
        ) : empty ? (
          <Alert title="Nothing to convert" tone="warn">
            <p>Paste {resultToHtml ? "Markdown" : "HTML"} into the input, or drop a file.</p>
            <Button
              size="sm"
              onClick={() => {
                setText(HELLO);
                setDirection("md-to-html");
              }}
              className="mt-3"
            >
              Load example
            </Button>
          </Alert>
        ) : (
          !result.ok && (
            <Alert id={ERROR_ID} title={resultToHtml ? "Unable to convert Markdown." : "Unable to convert HTML."}>
              <p>{result.error}</p>
            </Alert>
          )
        )}
      </OutputPanel>
    </>
  );
}

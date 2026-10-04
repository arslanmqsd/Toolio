"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import CodeBlock from "@/components/ui/CodeBlock";
import { CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { computeDiff, NO_OPTIONS, type CompareOptions } from "@/lib/tools/developer/diff/compare";
import { highlightHunks, HIGHLIGHT_LINE_LIMIT } from "@/lib/tools/developer/diff/highlight";
import { DEFAULT_CONTEXT } from "@/lib/tools/developer/diff/hunks";
import { LANGUAGES, languageForFile, type LanguageId } from "@/lib/tools/developer/diff/language";
import type { DiffFile } from "@/lib/tools/developer/diff/model";
import { generatePatch, patchFileName } from "@/lib/tools/developer/diff/patch";
import { readTextFile } from "@/lib/tools/developer/diff/text-file";
import DiffStats from "./diff/DiffStats";
import DiffView, { SPLIT_QUERY } from "./diff/DiffView";
import { useHighlighters } from "./diff/useHighlighters";

const EXAMPLE_ORIGINAL = 'function hello() {\n  console.log("Hello");\n}';
const EXAMPLE_MODIFIED = "function hello(name) {\n  console.log(`Hello ${name}`);\n}";
const DEFAULT_NAMES = { old: "original.txt", new: "modified.txt" };
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const VIEWS = [
  { id: "split", label: "Split" },
  { id: "unified", label: "Unified" },
  { id: "patch", label: "Patch" },
] as const;

type View = (typeof VIEWS)[number]["id"];
type Side = "old" | "new";

export default function TextDiffChecker() {
  const [original, setOriginal] = useToolInput(EXAMPLE_ORIGINAL, () => {
    // Outside data replaces the example, so the example's other half and its language no longer apply.
    setModified("");
    setNames(DEFAULT_NAMES);
    if (!languageTouched) setLanguage(null);
  });
  const [modified, setModified] = useState(EXAMPLE_MODIFIED);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [fileErrors, setFileErrors] = useState<Partial<Record<Side, string>>>({});
  const [view, setView] = useState<View>("split");
  const [options, setOptions] = useState<CompareOptions>(NO_OPTIONS);
  const [fullFile, setFullFile] = useState(false);
  const [language, setLanguage] = useState<LanguageId | null>("javascript");
  const [languageTouched, setLanguageTouched] = useState(false);
  const canSplit = useMediaQuery(SPLIT_QUERY);

  const oldText = useDeferredValue(original);
  const newText = useDeferredValue(modified);
  const result = useMemo(() => computeDiff(oldText, newText, options), [oldText, newText, options]);
  const patch = useMemo(() => generatePatch(oldText, newText, names.old, names.new), [oldText, newText, names]);

  const highlight = useHighlighters(language ? [language] : [])(language);
  const rowCount = result.ok ? result.file.hunks[0].rows.length : 0;
  const highlights = useMemo(
    () => (result.ok && highlight && rowCount <= HIGHLIGHT_LINE_LIMIT ? highlightHunks(result.file.hunks, highlight) : null),
    [result, highlight, rowCount],
  );

  async function loadFile(side: Side, file: File) {
    const read = await readTextFile(file, MAX_FILE_BYTES);
    if (!read.ok) {
      setFileErrors((errors) => ({ ...errors, [side]: read.error }));
      return;
    }
    setFileErrors((errors) => ({ ...errors, [side]: undefined }));
    (side === "old" ? setOriginal : setModified)(read.text);
    setNames((current) => ({ ...current, [side]: file.name }));
    if (!languageTouched) setLanguage(languageForFile(file.name));
  }

  function swap() {
    setOriginal(modified);
    setModified(original);
    setNames((current) => ({ old: current.new, new: current.old }));
    setFileErrors((errors) => ({ old: errors.new, new: errors.old }));
  }

  const setOption = (key: keyof CompareOptions) => (checked: boolean) => setOptions((o) => ({ ...o, [key]: checked }));

  const empty = original === "" && modified === "";
  const viewOptions = canSplit ? VIEWS : VIEWS.filter((v) => v.id !== "split");
  const shownView: View = !canSplit && view === "split" ? "unified" : view;

  function body() {
    if (empty) return <p className="text-[color:var(--text-muted)]">Paste or drop text into both panels.</p>;

    if (shownView === "patch") {
      if (patch === null) return <TooSlow />;
      if (patch === "") return <p className="text-[color:var(--text-muted)]">No differences.</p>;
      return (
        <div className="space-y-2">
          <p className="text-xs text-[color:var(--text-muted)]">
            The patch compares the texts exactly, so the ignore options don&apos;t apply and it works with{" "}
            <code className="font-[family-name:var(--font-mono)]">git apply</code>.
          </p>
          <div className="font-[family-name:var(--font-mono)]">
            <CodeBlock code={patch} />
          </div>
        </div>
      );
    }

    if (!result.ok) return <TooSlow />;
    const { file, hiddenByOptions } = result;
    const changed = file.stats.added + file.stats.removed > 0;
    const newline = newlineNote(file);
    return (
      <div className="space-y-3">
        <DiffStats stats={file.stats} />
        {newline && <p className="text-xs text-[color:var(--text-muted)]">{newline}</p>}
        {language && rowCount > HIGHLIGHT_LINE_LIMIT && (
          <p className="text-xs text-[color:var(--text-muted)]">Syntax colors are off for texts this long.</p>
        )}
        {changed ? (
          <DiffView
            hunks={file.hunks}
            layout={shownView}
            context={fullFile ? "all" : DEFAULT_CONTEXT}
            highlights={highlights}
          />
        ) : (
          <p className="text-[color:var(--text-muted)]">
            No differences.{hiddenByOptions && " Some differences are hidden by the ignore options."}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <InputPanel label="Texts" wide>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <TextSide
            id="diff-original"
            label="Original"
            value={original}
            onChange={setOriginal}
            error={fileErrors.old}
            onFile={(file) => loadFile("old", file)}
          />
          <div className="flex items-center justify-center md:pt-7">
            <Button icon={ArrowLeftRight} size="sm" onClick={swap}>
              Swap
            </Button>
          </div>
          <TextSide
            id="diff-modified"
            label="Modified"
            value={modified}
            onChange={setModified}
            error={fileErrors.new}
            onFile={(file) => loadFile("new", file)}
          />
        </div>
      </InputPanel>

      <OutputPanel
        label="Differences"
        wide
        copyText={!empty && patch ? patch : undefined}
        outputType="diff"
        download={{ filename: patchFileName(names.new), mimeType: "text/x-diff" }}
      >
        <div className="space-y-4 font-[family-name:var(--font-ui)]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <SegmentedControl label="View" options={viewOptions} value={shownView} onChange={setView} />
            <label className="flex items-center gap-2 text-sm">
              <span className="text-[color:var(--text-muted)]">Language</span>
              <Select
                value={language ?? ""}
                onChange={(e) => {
                  setLanguage((e.target.value || null) as LanguageId | null);
                  setLanguageTouched(true);
                }}
                className="w-40"
              >
                <option value="">Plain text</option>
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Checkbox checked={options.ignoreWhitespace} onChange={setOption("ignoreWhitespace")}>
              Ignore whitespace
            </Checkbox>
            <Checkbox checked={options.ignoreBlankLines} onChange={setOption("ignoreBlankLines")}>
              Ignore blank lines
            </Checkbox>
            <Checkbox checked={options.ignoreCase} onChange={setOption("ignoreCase")}>
              Ignore case
            </Checkbox>
            {shownView !== "patch" && (
              <Checkbox checked={fullFile} onChange={setFullFile}>
                Full file
              </Checkbox>
            )}
          </div>
          {body()}
        </div>
      </OutputPanel>
    </>
  );
}

interface TextSideProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onFile: (file: File) => void;
}

function TextSide({ id, label, value, onChange, error, onFile }: TextSideProps) {
  return (
    <Field label={label} htmlFor={id}>
      <CodeTextArea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FileDrop compact onFiles={([file]) => onFile(file)} />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-[color:var(--error)]">
          {error}
        </p>
      )}
    </Field>
  );
}

function TooSlow() {
  return <Alert title="Too slow to compare">These texts are too different to compare quickly.</Alert>;
}

/** A note when only one side ends with a newline: a real difference, but not one a line diff can show. */
function newlineNote({ noNewlineAtEnd }: DiffFile): string | null {
  if (!noNewlineAtEnd || noNewlineAtEnd.old === noNewlineAtEnd.new) return null;
  return `${noNewlineAtEnd.old ? "Original" : "Modified"} has no newline at the end; the other does.`;
}

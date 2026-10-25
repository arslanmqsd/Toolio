"use client";

import { useMemo, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Checkbox from "@/components/ui/Checkbox";
import { CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { plural } from "@/lib/notices";
import { DEFAULT_CLEAN, cleanText, type CleanOptions } from "@/lib/tools/text/clean";

const EXAMPLE = "  Copied   from a\u00A0PDF,\u200B this text\nhas hard   wraps,  “smart quotes” and\n\n\n\nstray    blank lines.  \nstray    blank lines.  ";

const BLANK_OPTIONS = [
  { id: "squeeze", label: "Squeeze to one" },
  { id: "remove", label: "Remove" },
  { id: "keep", label: "Keep" },
] as const;

export default function TextCleaner() {
  const [text, setText] = useToolInput(EXAMPLE);
  const [options, setOptions] = useState<CleanOptions>(DEFAULT_CLEAN);
  const set = <K extends keyof CleanOptions>(key: K) => (value: CleanOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));

  const output = useMemo(() => cleanText(text, options), [text, options]);
  const removed = [...text].length - [...output].length;

  return (
    <>
      <InputPanel label="Text">
        <div className="space-y-5">
          <CodeTextArea aria-label="Text to clean" value={text} onChange={(e) => setText(e.target.value)} rows={10} />

          <Field label="Blank lines">
            <SegmentedControl label="Blank lines" options={BLANK_OPTIONS} value={options.blankLines} onChange={set("blankLines")} />
          </Field>

          <div className="space-y-2">
            <Checkbox checked={options.trimLines} onChange={set("trimLines")}>
              Trim spaces at the start and end of lines
            </Checkbox>
            <Checkbox checked={options.collapseSpaces} onChange={set("collapseSpaces")}>
              Collapse repeated spaces and tabs
            </Checkbox>
            <Checkbox checked={options.invisible} onChange={set("invisible")}>
              Remove invisible characters and non-breaking spaces
            </Checkbox>
            <Checkbox checked={options.plainPunctuation} onChange={set("plainPunctuation")}>
              Straighten quotes and dashes (“ ” ’ – … → &quot; &apos; - ...)
            </Checkbox>
            <Checkbox checked={options.dedupeLines} onChange={set("dedupeLines")}>
              Remove duplicate lines
            </Checkbox>
            <Checkbox checked={options.joinLines} onChange={set("joinLines")}>
              Join wrapped lines into paragraphs
            </Checkbox>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label="Clean text"
        copyText={output || undefined}
        outputType="text"
        download={output ? { filename: "cleaned.txt", mimeType: "text/plain" } : undefined}
      >
        {output ? (
          <>
            <pre className="whitespace-pre-wrap break-words">{output}</pre>
            <p role="status" className="mt-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
              {removed > 0 ? `${plural(removed, "character", "characters")} removed.` : "Nothing to remove."}
            </p>
          </>
        ) : (
          <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">Paste some text to clean it.</p>
        )}
      </OutputPanel>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { CopyButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Checkbox from "@/components/ui/Checkbox";
import { CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { CASES, DEFAULT_CASE_OPTIONS, caseLabels, convertCase, isCodeCase, type TextCase } from "@/lib/tools/text/case";

const EXAMPLE = "the quick brown fox jumps over the lazy dog";

const CASE_OPTIONS = CASES.map((id) => ({ id, label: caseLabels[id] }));

export default function CaseConverter() {
  const [text, setText] = useToolInput(EXAMPLE);
  const [textCase, setTextCase] = useState<TextCase>("title");
  const [transliterate, setTransliterate] = useState(DEFAULT_CASE_OPTIONS.transliterate);
  const [keepAcronyms, setKeepAcronyms] = useState(DEFAULT_CASE_OPTIONS.keepAcronyms);
  const [lowerSmallWords, setLowerSmallWords] = useState(DEFAULT_CASE_OPTIONS.lowerSmallWords);

  const options = useMemo(() => ({ transliterate, keepAcronyms, lowerSmallWords }), [transliterate, keepAcronyms, lowerSmallWords]);
  const output = useMemo(() => convertCase(text, textCase, options), [text, textCase, options]);

  // One line is short enough to show in every case at once, so the right one can be picked by eye.
  const singleLine = text.trim() !== "" && !text.trim().includes("\n");
  const allCases = useMemo(
    () => (singleLine ? CASES.map((c) => ({ id: c, value: convertCase(text.trim(), c, options) })) : []),
    [singleLine, text, options],
  );

  return (
    <>
      <InputPanel label="Text">
        <div className="space-y-5">
          <CodeTextArea aria-label="Text to convert" value={text} onChange={(e) => setText(e.target.value)} rows={8} />

          <Field label="Convert to">
            <SegmentedControl label="Convert to" options={CASE_OPTIONS} value={textCase} onChange={setTextCase} />
          </Field>

          <div className="space-y-2">
            {isCodeCase(textCase) ? (
              <>
                <Checkbox checked={transliterate} onChange={setTransliterate}>
                  Spell accented letters in plain Latin (crème → creme)
                </Checkbox>
                <p className="text-xs text-[color:var(--text-muted)]">Each line converts on its own, so a list of names converts in one go.</p>
              </>
            ) : textCase === "title" || textCase === "sentence" ? (
              <>
                <Checkbox checked={keepAcronyms} onChange={setKeepAcronyms}>
                  Keep words in capitals, like NASA or HTML
                </Checkbox>
                {textCase === "title" && (
                  <Checkbox checked={lowerSmallWords} onChange={setLowerSmallWords}>
                    Keep short words lower case (a, the, of…)
                  </Checkbox>
                )}
              </>
            ) : null}
          </div>

          {textCase === "kebab" && (
            <p className="text-xs text-[color:var(--text-muted)]">
              Making URLs? The{" "}
              <Link href="/tools/text/slug-generator" className="text-[color:var(--accent-text)] underline">
                Slug Generator
              </Link>{" "}
              also limits length and numbers repeats.
            </p>
          )}
        </div>
      </InputPanel>

      <OutputPanel
        label={caseLabels[textCase]}
        copyText={output || undefined}
        outputType="text"
        download={output ? { filename: "converted.txt", mimeType: "text/plain" } : undefined}
      >
        {output ? (
          <pre className="whitespace-pre-wrap break-words">{output}</pre>
        ) : (
          <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">Type some text to convert it.</p>
        )}

        {allCases.length > 0 && (
          <section aria-labelledby="all-cases" className="mt-6 border-t border-[color:var(--border)] pt-4">
            <h2 id="all-cases" className="mb-2 font-[family-name:var(--font-ui)] text-xs font-medium text-[color:var(--text-muted)]">
              Every case
            </h2>
            <ul className="divide-y divide-[color:var(--border)]">
              {allCases.map(({ id, value }) => (
                <li key={id} className="flex items-center justify-between gap-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => setTextCase(id)}
                    aria-pressed={id === textCase}
                    className={`min-w-0 flex-1 text-left ${id === textCase ? "text-[color:var(--accent-text)]" : ""}`}
                  >
                    <span className="block font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">{caseLabels[id]}</span>
                    <span className="block break-all">{value}</span>
                  </button>
                  <CopyButton text={value} what={caseLabels[id]} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </OutputPanel>
    </>
  );
}

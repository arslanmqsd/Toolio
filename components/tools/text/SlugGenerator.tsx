"use client";

import { useMemo, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { CopyButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import ResultNotices from "@/components/ui/ResultNotices";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { plural } from "@/lib/notices";
import {
  DEFAULT_REPLACEMENTS,
  DEFAULT_SLUG,
  LONG_SLUG,
  MAX_SLUG_LENGTH,
  parseReplacements,
  slugifyLines,
  type SlugFormat,
  type SlugSeparator,
} from "@/lib/tools/text/slug";

const EXAMPLE = "10 Tips for Writing Clean Code\nCrème Brûlée: A Beginner's Guide\nWhat's New in Next.js 15?\nTom & Jerry's Greatest Hits\n10 Tips for Writing Clean Code";

const SEPARATORS = [
  { id: "-", label: "Hyphen -" },
  { id: "_", label: "Underscore _" },
  { id: ".", label: "Dot ." },
] as const;

const FORMATS = [
  { id: "slugs", label: "Slugs" },
  { id: "csv", label: "CSV with titles" },
] as const;

const MAX_LENGTH_ERROR_ID = "slug-max-length-error";
const REPLACEMENTS_ERROR_ID = "slug-replacements-error";

export default function SlugGenerator() {
  const [text, setText] = useToolInput(EXAMPLE);
  const [separator, setSeparator] = useState<SlugSeparator>(DEFAULT_SLUG.separator);
  const [lowercase, setLowercase] = useState(DEFAULT_SLUG.lowercase);
  const [maxLengthText, setMaxLengthText] = useState("");
  const [removeStopWords, setRemoveStopWords] = useState(DEFAULT_SLUG.removeStopWords);
  const [unique, setUnique] = useState(DEFAULT_SLUG.unique);
  const [keepUnicode, setKeepUnicode] = useState(DEFAULT_SLUG.keepUnicode);
  const [replacementsText, setReplacementsText] = useState(DEFAULT_REPLACEMENTS);
  const [format, setFormat] = useState<SlugFormat>(DEFAULT_SLUG.format);

  // Blank means no limit.
  const maxLength = maxLengthText.trim() ? Number(maxLengthText) : 0;
  const maxLengthValid = !maxLengthText.trim() || (/^\s*\d+\s*$/.test(maxLengthText) && maxLength >= 1 && maxLength <= MAX_SLUG_LENGTH);
  const { replacements, invalidLines } = useMemo(() => parseReplacements(replacementsText), [replacementsText]);

  const result = useMemo(
    () =>
      maxLengthValid
        ? slugifyLines(text, { separator, lowercase, maxLength, removeStopWords, unique, keepUnicode, replacements, format })
        : null,
    [text, separator, lowercase, maxLength, maxLengthValid, removeStopWords, unique, keepUnicode, replacements, format],
  );

  const isDefault =
    separator === DEFAULT_SLUG.separator &&
    lowercase === DEFAULT_SLUG.lowercase &&
    maxLengthText === "" &&
    removeStopWords === DEFAULT_SLUG.removeStopWords &&
    unique === DEFAULT_SLUG.unique &&
    keepUnicode === DEFAULT_SLUG.keepUnicode &&
    replacementsText === DEFAULT_REPLACEMENTS &&
    format === DEFAULT_SLUG.format;

  function reset() {
    setSeparator(DEFAULT_SLUG.separator);
    setLowercase(DEFAULT_SLUG.lowercase);
    setMaxLengthText("");
    setRemoveStopWords(DEFAULT_SLUG.removeStopWords);
    setUnique(DEFAULT_SLUG.unique);
    setKeepUnicode(DEFAULT_SLUG.keepUnicode);
    setReplacementsText(DEFAULT_REPLACEMENTS);
    setFormat(DEFAULT_SLUG.format);
  }

  const filled = result?.lines.filter((l) => l.slug) ?? [];
  const long = filled.filter((l) => l.slug.length > LONG_SLUG).length;

  return (
    <>
      <InputPanel label="Titles">
        <div className="space-y-5">
          <Field label="Titles, one per line" htmlFor="slug-input">
            <CodeTextArea id="slug-input" value={text} onChange={(e) => setText(e.target.value)} rows={8} />
          </Field>

          <Field label="Separator">
            <SegmentedControl label="Separator" options={SEPARATORS} value={separator} onChange={setSeparator} />
          </Field>

          <Field label="Max length" htmlFor="slug-max-length" help={`Cut at a word boundary. Leave blank for no limit, or up to ${MAX_SLUG_LENGTH}.`}>
            <CodeInput
              id="slug-max-length"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SLUG_LENGTH}
              placeholder="No limit"
              value={maxLengthText}
              onChange={(e) => setMaxLengthText(e.target.value)}
              invalid={!maxLengthValid}
              aria-describedby={maxLengthValid ? undefined : MAX_LENGTH_ERROR_ID}
              className="sm:max-w-40"
            />
          </Field>

          <div className="space-y-2">
            <Checkbox checked={lowercase} onChange={setLowercase}>
              Lowercase
            </Checkbox>
            <Checkbox checked={removeStopWords} onChange={setRemoveStopWords}>
              Remove stop words (a, the, of…)
            </Checkbox>
            <Checkbox checked={unique} onChange={setUnique}>
              Number repeated slugs (post, post-2)
            </Checkbox>
            <Checkbox checked={keepUnicode} onChange={setKeepUnicode}>
              Keep non-Latin letters (東京, العربية)
            </Checkbox>
          </div>

          <Field label="Output">
            <SegmentedControl label="Output" options={FORMATS} value={format} onChange={setFormat} />
          </Field>

          <details className="text-sm" open={invalidLines.length > 0 || undefined}>
            <summary className="cursor-pointer font-medium">Advanced</summary>
            <div className="mt-3">
              <Field
                label="Replacements"
                htmlFor="slug-replacements"
                help="One per line as from=to, swapped before slugging. Leave the right side empty to remove text."
              >
                <CodeTextArea
                  id="slug-replacements"
                  value={replacementsText}
                  onChange={(e) => setReplacementsText(e.target.value)}
                  rows={3}
                  invalid={invalidLines.length > 0}
                  aria-describedby={invalidLines.length ? REPLACEMENTS_ERROR_ID : undefined}
                />
              </Field>
              {invalidLines.length > 0 && (
                <p id={REPLACEMENTS_ERROR_ID} className="mt-2 text-xs text-[color:var(--error)]">
                  Ignoring {invalidLines.length === 1 ? "line" : "lines"} {invalidLines.join(", ")}: write each as from=to.
                </p>
              )}
            </div>
          </details>

          <Button onClick={reset} disabled={isDefault}>
            Reset options
          </Button>
        </div>
      </InputPanel>

      <OutputPanel
        label="Slugs"
        copyText={result?.output || undefined}
        outputType={format === "csv" ? "csv" : "text"}
        download={result?.output ? (format === "csv" ? { filename: "slugs.csv", mimeType: "text/csv" } : { filename: "slugs.txt", mimeType: "text/plain" }) : undefined}
      >
        {!maxLengthValid ? (
          <Alert id={MAX_LENGTH_ERROR_ID} title="Can't make slugs">
            Enter a max length from 1 to {MAX_SLUG_LENGTH}, or leave it blank for no limit.
          </Alert>
        ) : !filled.length && !result?.notices.length ? (
          <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">Type a title to get its slug.</p>
        ) : (
          result && (
            <>
              <ResultNotices notices={result.notices} />
              <p className="mb-3 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                {plural(filled.length, "slug", "slugs")}
                {long > 0 && ` · ${long} longer than ${LONG_SLUG} characters, which search results may cut off`}
              </p>
              {format === "csv" ? (
                <pre className="whitespace-pre-wrap break-all">{result.output}</pre>
              ) : (
                <ul className="divide-y divide-[color:var(--border)]">
                  {filled.map((line, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="break-all font-[family-name:var(--font-mono)]">{line.slug}</div>
                        <div className="truncate font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]" title={line.source}>
                          {line.source}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`font-[family-name:var(--font-ui)] text-xs tabular-nums ${
                            line.slug.length > LONG_SLUG ? "text-[color:var(--accent-warn-text)]" : "text-[color:var(--text-muted)]"
                          }`}
                        >
                          {line.slug.length}
                          <span className="sr-only"> characters</span>
                        </span>
                        <CopyButton text={line.slug} what={line.slug} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        )}
      </OutputPanel>
    </>
  );
}

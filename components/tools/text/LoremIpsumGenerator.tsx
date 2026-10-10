"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import ResultNotices from "@/components/ui/ResultNotices";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import { plural } from "@/lib/notices";
import {
  DEFAULT_LOREM,
  LOREM_LIMITS,
  MAX_SEED,
  generate,
  randomSeed,
  unitNames,
  type LoremFormat,
  type LoremUnit,
} from "@/lib/tools/text/lorem-ipsum";

const UNITS: { id: LoremUnit; label: string }[] = [
  { id: "paragraphs", label: "Paragraphs" },
  { id: "sentences", label: "Sentences" },
  { id: "words", label: "Words" },
  { id: "characters", label: "Characters" },
  { id: "listItems", label: "List items" },
];

const FORMATS = [
  { id: "text", label: "Plain text" },
  { id: "html", label: "HTML" },
  { id: "markdown", label: "Markdown" },
] as const;

const FILES: Record<LoremFormat, { extension: string; mimeType: string }> = {
  text: { extension: "txt", mimeType: "text/plain" },
  html: { extension: "html", mimeType: "text/html" },
  markdown: { extension: "md", mimeType: "text/markdown" },
};

const DEFAULT_COUNT = String(DEFAULT_LOREM.count);
const DEFAULT_SEED = String(DEFAULT_LOREM.seed);
const COUNT_ERROR_ID = "lorem-count-error";
const SEED_ERROR_ID = "lorem-seed-error";

export default function LoremIpsumGenerator() {
  const [unit, setUnit] = useState<LoremUnit>(DEFAULT_LOREM.unit);
  const [countText, setCountText] = useState(DEFAULT_COUNT);
  const [startWithLorem, setStartWithLorem] = useState(DEFAULT_LOREM.startWithLorem);
  const [format, setFormat] = useState<LoremFormat>(DEFAULT_LOREM.format);
  // The seed stays put while options change, so the text doesn't reshuffle on every tweak.
  const [seedText, setSeedText] = useState(DEFAULT_SEED);

  const count = Number(countText);
  const countValid = /^\s*\d+\s*$/.test(countText);
  const seed = Number(seedText);
  const seedValid = /^\s*\d+\s*$/.test(seedText) && seed <= MAX_SEED;

  const result = useMemo(
    () => (countValid && seedValid ? generate({ unit, count, startWithLorem, format, seed }) : null),
    [unit, count, countValid, startWithLorem, format, seed, seedValid],
  );

  const isDefault =
    unit === DEFAULT_LOREM.unit && countText === DEFAULT_COUNT && startWithLorem === DEFAULT_LOREM.startWithLorem && format === DEFAULT_LOREM.format && seedText === DEFAULT_SEED;

  function reset() {
    setUnit(DEFAULT_LOREM.unit);
    setCountText(DEFAULT_COUNT);
    setStartWithLorem(DEFAULT_LOREM.startWithLorem);
    setFormat(DEFAULT_LOREM.format);
    setSeedText(DEFAULT_SEED);
  }

  const max = LOREM_LIMITS[unit];
  const [, many] = unitNames[unit];
  const file = FILES[format];

  return (
    <>
      <InputPanel label="Options">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Generate" htmlFor="lorem-unit">
              <Select id="lorem-unit" value={unit} onChange={(e) => setUnit(e.target.value as LoremUnit)}>
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={`How many ${many}`}
              htmlFor="lorem-count"
              help={unit === "characters" ? `Exactly this long, so it may end mid-word. Up to ${max.toLocaleString("en-US")}.` : `Up to ${max.toLocaleString("en-US")}.`}
            >
              <CodeInput
                id="lorem-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                value={countText}
                onChange={(e) => setCountText(e.target.value)}
                invalid={!countValid}
                aria-describedby={countValid ? undefined : COUNT_ERROR_ID}
              />
            </Field>
          </div>

          <Checkbox checked={startWithLorem} onChange={setStartWithLorem}>
            Start with &ldquo;Lorem ipsum dolor sit amet…&rdquo;
          </Checkbox>

          <Field label="Format">
            <SegmentedControl label="Format" options={FORMATS} value={format} onChange={setFormat} />
          </Field>

          <details className="text-sm" open={!seedValid || undefined}>
            <summary className="cursor-pointer font-medium">Advanced</summary>
            <div className="mt-3">
              <Field label="Seed" htmlFor="lorem-seed" help="The same seed and options always make the same text.">
                <CodeInput
                  id="lorem-seed"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value)}
                  invalid={!seedValid}
                  aria-describedby={seedValid ? undefined : SEED_ERROR_ID}
                  className="max-w-48"
                />
              </Field>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button icon={RefreshCw} onClick={() => setSeedText(String(randomSeed()))}>
              New text
            </Button>
            <Button onClick={reset} disabled={isDefault}>
              Reset
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label="Lorem ipsum"
        copyText={result?.value}
        outputType={format}
        download={result ? { filename: `lorem-ipsum.${file.extension}`, mimeType: file.mimeType } : undefined}
      >
        {!countValid ? (
          <Alert id={COUNT_ERROR_ID} title="Can't generate">
            Enter a whole number of {many} from 1 to {max.toLocaleString("en-US")}.
          </Alert>
        ) : !seedValid ? (
          <Alert id={SEED_ERROR_ID} title="Can't generate">
            Enter a seed: a whole number from 0 to {MAX_SEED.toLocaleString("en-US")}.
          </Alert>
        ) : (
          result && (
            <>
              <ResultNotices notices={result.notices} />
              <p className="mb-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                {unit === "listItems" ? plural(result.stats.listItems, "list item", "list items") : plural(result.stats.paragraphs, "paragraph", "paragraphs")}
                {" · "}
                {plural(result.stats.words, "word", "words")}
                {" · "}
                {plural(result.stats.characters, "character", "characters")}
              </p>
              <div
                lang="la"
                className={
                  format === "text"
                    ? "whitespace-pre-wrap break-words font-[family-name:var(--font-ui)] text-base leading-relaxed"
                    : "whitespace-pre-wrap break-words font-[family-name:var(--font-mono)] text-sm"
                }
              >
                {result.value}
              </div>
            </>
          )
        )}
      </OutputPanel>
    </>
  );
}

"use client";

import { useMemo, useState, type SyntheticEvent } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import ValueTable from "@/components/ui/ValueTable";
import { plural, some } from "@/lib/notices";
import { READING_WPM, SPEAKING_WPM, countSms, countText, formatDuration, measure, topWords, wordsOf } from "@/lib/tools/text/word-count";

const EXAMPLE = `Toolio counts words the way readers see them. An emoji like 👨‍👩‍👧 is one character on screen, yet JavaScript says its length is 8 and it takes 18 bytes in UTF-8.

Paste your text here to see its words, sentences, reading time and length in every unit that matters.`;

type LimitUnit = "characters" | "words" | "bytes";

interface LimitPreset {
  id: string;
  label: string;
  max: number;
  unit: LimitUnit;
}

// Characters as people see them; most sites count close to this.
const PRESETS: LimitPreset[] = [
  { id: "meta-title", label: "Page title (about 60)", max: 60, unit: "characters" },
  { id: "meta-description", label: "Meta description (about 160)", max: 160, unit: "characters" },
  { id: "youtube-title", label: "YouTube title (100)", max: 100, unit: "characters" },
  { id: "instagram", label: "Instagram caption (2,200)", max: 2200, unit: "characters" },
  { id: "linkedin", label: "LinkedIn post (3,000)", max: 3000, unit: "characters" },
];

const UNITS = [
  { id: "characters", label: "Characters" },
  { id: "words", label: "Words" },
  { id: "bytes", label: "UTF-8 bytes" },
] as const;

const unitNames: Record<LimitUnit, [string, string]> = {
  characters: ["character", "characters"],
  words: ["word", "words"],
  bytes: ["byte", "bytes"],
};

const n = (value: number) => value.toLocaleString("en-US");

export default function WordCounter() {
  const [text, setText] = useToolInput(EXAMPLE);
  const [check, setCheck] = useState("none");
  const [customMaxText, setCustomMaxText] = useState("255");
  const [customUnit, setCustomUnit] = useState<LimitUnit>("characters");
  const [selection, setSelection] = useState<[number, number]>([0, 0]);

  const stats = useMemo(() => countText(text), [text]);
  const top = useMemo(() => topWords(text), [text]);
  const sms = useMemo(() => (check === "sms" ? countSms(text) : null), [check, text]);

  const selected = text.slice(selection[0], selection[1]);
  const selectedStats = useMemo(() => (selected ? { words: wordsOf(selected).length, characters: measure(selected).characters } : null), [selected]);

  const customMax = Number(customMaxText);
  const customValid = /^\s*\d+\s*$/.test(customMaxText) && customMax >= 1;
  const preset = PRESETS.find((p) => p.id === check);
  const limit = preset ?? (check === "custom" && customValid ? { label: "Custom limit", max: customMax, unit: customUnit } : null);
  const used = limit ? { characters: stats.characters, words: stats.words, bytes: stats.utf8Bytes }[limit.unit] : 0;

  function trackSelection(e: SyntheticEvent<HTMLTextAreaElement>) {
    const { selectionStart, selectionEnd } = e.currentTarget;
    setSelection([selectionStart, selectionEnd]);
  }

  const summary = [
    `Words: ${n(stats.words)}`,
    `Characters: ${n(stats.characters)}`,
    `Characters without spaces: ${n(stats.charactersNoSpaces)}`,
    `Sentences: ${n(stats.sentences)}`,
    `Paragraphs: ${n(stats.paragraphs)}`,
    `Lines: ${n(stats.lines)}`,
    `Reading time: ${formatDuration(stats.readingSeconds)}`,
    `Speaking time: ${formatDuration(stats.speakingSeconds)}`,
    `UTF-8 bytes: ${n(stats.utf8Bytes)}`,
  ].join("\n");

  const lengthsDiffer = stats.characters !== stats.utf16 || stats.utf16 !== stats.utf8Bytes;

  return (
    <>
      <InputPanel label="Text">
        <div className="space-y-5">
          <CodeTextArea
            aria-label="Text to count"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              trackSelection(e);
            }}
            onSelect={trackSelection}
            rows={12}
            spellCheck
          />

          <Field label="Check length against" htmlFor="word-count-check">
            <Select id="word-count-check" value={check} onChange={(e) => setCheck(e.target.value)}>
              <option value="none">Nothing</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="sms">SMS segments</option>
              <option value="custom">Custom limit…</option>
            </Select>
          </Field>

          {check === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Limit" htmlFor="word-count-max">
                <CodeInput
                  id="word-count-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={customMaxText}
                  onChange={(e) => setCustomMaxText(e.target.value)}
                  invalid={!customValid}
                  className="w-32"
                />
              </Field>
              <SegmentedControl label="Count" options={UNITS} value={customUnit} onChange={setCustomUnit} />
            </div>
          )}
        </div>
      </InputPanel>

      <OutputPanel label="Counts" copyText={text ? summary : undefined}>
        <div className="space-y-6 font-[family-name:var(--font-ui)]">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Words", n(stats.words)],
              ["Characters", n(stats.characters)],
              ["Sentences", n(stats.sentences)],
              ["Paragraphs", n(stats.paragraphs)],
              ["Reading time", formatDuration(stats.readingSeconds)],
              ["Speaking time", formatDuration(stats.speakingSeconds)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[color:var(--border)] px-3 py-2">
                <dt className="text-xs text-[color:var(--text-muted)]">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="-mt-3 text-xs text-[color:var(--text-muted)]">
            Reading at {READING_WPM} and speaking at {SPEAKING_WPM} words a minute.
          </p>

          <p aria-live="polite" className="text-sm text-[color:var(--text-muted)]">
            {selectedStats && (
              <>
                Selected: {plural(selectedStats.words, "word", "words")}, {plural(selectedStats.characters, "character", "characters")}
              </>
            )}
          </p>

          {limit && <LimitMeter label={limit.label} used={used} max={limit.max} unit={limit.unit} />}

          {sms && (
            <section aria-labelledby="sms-heading" className="space-y-1 text-sm">
              <h2 id="sms-heading" className="text-xs font-medium text-[color:var(--text-muted)]">
                SMS
              </h2>
              <p>
                <span className="font-semibold tabular-nums">{plural(sms.segments, "segment", "segments")}</span> · {sms.encoding} ·{" "}
                {n(sms.remaining)} left in this segment
              </p>
              <p className="text-xs text-[color:var(--text-muted)]">
                {sms.encoding === "GSM-7"
                  ? `Up to 160 characters fit in one message, or 153 per part when split. Characters like € [ ] { } count twice.`
                  : `Unicode messages fit 70 characters, or 67 per part when split. Switched to Unicode because of ${some(sms.unicodeCharacters, 6)}.`}
              </p>
            </section>
          )}

          <section aria-labelledby="length-heading">
            <h2 id="length-heading" className="mb-1 text-xs font-medium text-[color:var(--text-muted)]">
              Length
            </h2>
            <ValueTable
              rows={[
                {
                  label: "Characters",
                  value: n(stats.characters),
                  note: lengthsDiffer ? "As a reader sees them. Emoji and accented letters can be several code points or bytes each." : undefined,
                },
                { label: "Characters without spaces", value: n(stats.charactersNoSpaces) },
                { label: "Code points", value: n(stats.codePoints) },
                { label: "UTF-16 units (JavaScript length)", value: n(stats.utf16) },
                { label: "UTF-8 bytes", value: n(stats.utf8Bytes) },
                { label: "Lines", value: n(stats.lines) },
              ]}
            />
          </section>

          {top.length > 0 && (
            <section aria-labelledby="top-words-heading">
              <h2 id="top-words-heading" className="mb-1 text-xs font-medium text-[color:var(--text-muted)]">
                Most used words
              </h2>
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Word</th>
                    <th>Times</th>
                    <th>Share of words</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map(({ word, count, share }) => (
                    <tr key={word} className="border-t border-[color:var(--border)]">
                      <td className="break-all py-1.5 pl-1 pr-4">{word}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{n(count)}</td>
                      <td className="py-1.5 pr-1 text-right tabular-nums text-[color:var(--text-muted)]">{(share * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">Leaves out common English words like “the” and “and”.</p>
            </section>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

function LimitMeter({ label, used, max, unit }: { label: string; used: number; max: number; unit: LimitUnit }) {
  const over = used > max;
  const [one, many] = unitNames[unit];
  return (
    <section aria-label={label} className="space-y-1 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-[color:var(--text-muted)]">{label}</span>
        <span className={`tabular-nums ${over ? "font-semibold text-[color:var(--error)]" : ""}`}>
          {n(used)} / {n(max)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${label}: ${n(used)} of ${n(max)} ${many}`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(used, max)}
        className="h-1.5 overflow-hidden rounded-full bg-[color:var(--border)]"
      >
        <div
          className={`h-full rounded-full ${over ? "bg-[color:var(--error)]" : "bg-[color:var(--accent)]"}`}
          style={{ width: `${Math.min(100, (used / max) * 100)}%` }}
        />
      </div>
      <p aria-live="polite" className={`text-xs ${over ? "text-[color:var(--error)]" : "text-[color:var(--text-muted)]"}`}>
        {over ? `${plural(used - max, one, many)} over the limit` : `${plural(max - used, one, many)} left`}
      </p>
    </section>
  );
}

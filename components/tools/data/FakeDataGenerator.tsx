"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SeedField from "@/components/ui/SeedField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TabularOutput, { type TabularView } from "@/components/ui/TabularOutput";
import { plural } from "@/lib/notices";
import { MAX_SEED, parseSeed, randomSeed } from "@/lib/random/seeded";
import {
  DEFAULT_FAKE_DATA,
  FAKE_FIELDS,
  MAX_FAKE_ROWS,
  generateFakeData,
  type FakeFieldId,
  type FakeFormat,
  type KeyStyle,
} from "@/lib/tools/data/fake-data";

const FORMATS = [
  { id: "json", label: "JSON" },
  { id: "csv", label: "CSV" },
] as const;

const KEY_STYLES = [
  { id: "camel", label: "camelCase" },
  { id: "snake", label: "snake_case" },
] as const;

const ALL_FIELDS = FAKE_FIELDS.map((f) => f.id);
const DEFAULT_COUNT = String(DEFAULT_FAKE_DATA.count);
const DEFAULT_SEED = String(DEFAULT_FAKE_DATA.seed);
const COUNT_ERROR_ID = "fake-count-error";
const SEED_ERROR_ID = "fake-seed-error";

const sameFields = (a: FakeFieldId[], b: FakeFieldId[]) => a.length === b.length && a.every((f) => b.includes(f));

export default function FakeDataGenerator() {
  const [countText, setCountText] = useState(DEFAULT_COUNT);
  const [fields, setFields] = useState<FakeFieldId[]>(DEFAULT_FAKE_DATA.fields);
  const [format, setFormat] = useState<FakeFormat>(DEFAULT_FAKE_DATA.format);
  const [keyStyle, setKeyStyle] = useState<KeyStyle>(DEFAULT_FAKE_DATA.keyStyle);
  // The seed stays put while options change, so the rows don't reshuffle on every tweak.
  const [seedText, setSeedText] = useState(DEFAULT_SEED);
  const [view, setView] = useState<TabularView>("text");

  const count = Number(countText);
  const countValid = /^\s*\d+\s*$/.test(countText);
  const seed = parseSeed(seedText);

  const result = useMemo(
    () => (countValid && seed !== null ? generateFakeData({ count, fields, format, keyStyle, seed }) : null),
    [count, countValid, fields, format, keyStyle, seed],
  );
  const value = result?.ok ? result.value : undefined;

  const isDefault =
    countText === DEFAULT_COUNT &&
    sameFields(fields, DEFAULT_FAKE_DATA.fields) &&
    format === DEFAULT_FAKE_DATA.format &&
    keyStyle === DEFAULT_FAKE_DATA.keyStyle &&
    seedText === DEFAULT_SEED;

  function reset() {
    setCountText(DEFAULT_COUNT);
    setFields(DEFAULT_FAKE_DATA.fields);
    setFormat(DEFAULT_FAKE_DATA.format);
    setKeyStyle(DEFAULT_FAKE_DATA.keyStyle);
    setSeedText(DEFAULT_SEED);
  }

  const toggle = (id: FakeFieldId, on: boolean) => setFields((current) => (on ? [...current, id] : current.filter((f) => f !== id)));

  return (
    <>
      <InputPanel label="Options">
        <div className="space-y-5">
          <Field label="Rows" htmlFor="fake-count" help={`Up to ${MAX_FAKE_ROWS.toLocaleString("en-US")}.`}>
            <CodeInput
              id="fake-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_FAKE_ROWS}
              value={countText}
              onChange={(e) => setCountText(e.target.value)}
              invalid={!countValid}
              aria-describedby={countValid ? undefined : COUNT_ERROR_ID}
              className="max-w-40"
            />
          </Field>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Fields</legend>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setFields(ALL_FIELDS)} disabled={fields.length === ALL_FIELDS.length}>
                Select all
              </Button>
              <Button size="sm" onClick={() => setFields([])} disabled={fields.length === 0}>
                Select none
              </Button>
            </div>
            <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
              {FAKE_FIELDS.map((f) => (
                <Checkbox key={f.id} checked={fields.includes(f.id)} onChange={(on) => toggle(f.id, on)}>
                  {f.label}
                </Checkbox>
              ))}
            </div>
            <p className="text-xs text-[color:var(--text-muted)]">
              Addresses are in the United States. Emails use example.com, .org and .net, and phone numbers use 555-0100 to 555-0199, which are set aside for
              examples, so none reach a real person.
            </p>
          </fieldset>

          <div className="flex flex-wrap gap-x-8 gap-y-5">
            <Field label="Format">
              <SegmentedControl label="Format" options={FORMATS} value={format} onChange={setFormat} />
            </Field>
            <Field label="Key names">
              <SegmentedControl label="Key names" options={KEY_STYLES} value={keyStyle} onChange={setKeyStyle} />
            </Field>
          </div>

          <details className="text-sm" open={seed === null || undefined}>
            <summary className="cursor-pointer font-medium">Advanced</summary>
            <div className="mt-3">
              <SeedField id="fake-seed" value={seedText} onChange={setSeedText} errorId={SEED_ERROR_ID} />
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button icon={RefreshCw} onClick={() => setSeedText(String(randomSeed()))}>
              New data
            </Button>
            <Button onClick={reset} disabled={isDefault}>
              Reset
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label="Fake data"
        copyText={value}
        outputType={format}
        download={value ? { filename: `fake-data.${format}`, mimeType: format === "json" ? "application/json" : "text/csv" } : undefined}
      >
        {!countValid ? (
          <Alert id={COUNT_ERROR_ID} title="Can't generate">
            Enter a whole number of rows from 1 to {MAX_FAKE_ROWS.toLocaleString("en-US")}.
          </Alert>
        ) : seed === null ? (
          <Alert id={SEED_ERROR_ID} title="Can't generate">
            Enter a seed: a whole number from 0 to {MAX_SEED.toLocaleString("en-US")}.
          </Alert>
        ) : result && !result.ok ? (
          <Alert title="Nothing to generate" tone="warn">
            {result.error}
          </Alert>
        ) : (
          result?.ok && (
            <TabularOutput
              summary={`${plural(result.table.rowCount, "row", "rows")} × ${plural(result.table.columnCount, "field", "fields")}`}
              notices={result.notices}
              textLabel={format === "json" ? "JSON" : "CSV"}
              text={result.value}
              table={result.table}
              tableLabel="Fake data"
              view={view}
              onView={setView}
            />
          )
        )}
      </OutputPanel>
    </>
  );
}

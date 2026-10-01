"use client";

import { useMemo, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import Section from "@/components/ui/Section";
import TimeZoneSelect from "@/components/ui/TimeZoneSelect";
import ValueTable from "@/components/ui/ValueTable";
import { useNow } from "@/lib/hooks/useNow";
import { useTimeZone } from "@/lib/hooks/useTimeZone";
import { relativeTime } from "@/lib/relative-time";
import { formatInTimeZone } from "@/lib/time-zone";
import {
  CRON_FIELDS,
  daysCombineWithOr,
  describeCron,
  describeCronField,
  fieldRange,
  nextCronRuns,
  parseCron,
  parseCronFields,
  splitCron,
} from "@/lib/tools/developer/cron";

const EXAMPLE = "0 9 * * 1-5";
const RUN_COUNT = 10;
const ERROR_ID = "cron-error";

const PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekdays at 09:00", value: "0 9 * * 1-5" },
  { label: "Sundays at midnight", value: "0 0 * * 0" },
  { label: "Monthly on the 1st", value: "0 0 1 * *" },
  { label: "Yearly on 1 January", value: "0 0 1 1 *" },
];

const SYNTAX: [string, string][] = [
  ["*", "every value"],
  [",", "a list: 1,15"],
  ["-", "a range: 1-5"],
  ["/", "a step: */15, or 0-30/10"],
  ["JAN–DEC, SUN–SAT", "month and weekday names; 0 and 7 are both Sunday"],
  ["@hourly, @daily, …", "shortcuts, also @weekly, @monthly and @yearly"],
];

export default function CronBuilder() {
  const now = useNow();
  const [text, setText] = useToolInput(EXAMPLE);
  const { zone, setZone, localZone, zones } = useTimeZone();

  // The field inputs edit `parts`, which follows the expression whenever it has five fields. A field cleared
  // to retype leaves a gap the expression can't show, so `parts` keeps it until the field is filled again.
  const split = splitCron(text);
  const [parts, setParts] = useState(() => split ?? ["*", "*", "*", "*", "*"]);
  if (split && split.join(" ") !== parts.join(" ")) setParts(split);
  const editingField = !split && parts.join(" ") === text;
  const fieldsDisabled = !split && !editingField;

  const result = useMemo(() => (editingField ? parseCronFields(parts) : parseCron(text)), [editingField, parts, text]);

  function setField(index: number, value: string) {
    const next = parts.map((part, i) => (i === index ? value.replace(/\s+/g, "") : part));
    setParts(next);
    setText(next.join(" "));
  }

  // Recomputed once a minute, not on every tick of the clock.
  const minute = now === null ? null : Math.floor(now / 60_000);
  const runs = useMemo(
    () => (result.ok && minute !== null ? nextCronRuns(result.schedule, minute * 60_000, zone, RUN_COUNT) : null),
    [result, minute, zone],
  );

  const normalized = result.ok ? (result.macro ?? result.fields.join(" ")) : undefined;

  return (
    <>
      <InputPanel label="Cron expression">
        <div className="space-y-5">
          <CodeInput
            aria-label="Cron expression"
            value={text}
            onChange={(e) => setText(e.target.value)}
            invalid={!result.ok}
            aria-describedby={result.ok ? undefined : ERROR_ID}
            placeholder="*/15 * * * *"
            className="text-base"
          />

          <fieldset disabled={fieldsDisabled}>
            <legend className="sr-only">Fields</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
              {CRON_FIELDS.map((spec, i) => {
                const invalid = !result.ok && result.field === spec.id;
                return (
                  <Field key={spec.id} label={spec.label} htmlFor={`cron-${spec.id}`} help={fieldRange(spec.id)}>
                    <CodeInput
                      id={`cron-${spec.id}`}
                      value={parts[i]}
                      onChange={(e) => setField(i, e.target.value)}
                      invalid={invalid}
                      aria-describedby={invalid ? ERROR_ID : undefined}
                      className="disabled:opacity-50"
                    />
                  </Field>
                );
              })}
            </div>
            {fieldsDisabled && (
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">Fix the number of fields in the expression to edit them here.</p>
            )}
          </fieldset>

          <Field label="Common schedules">
            <div role="group" aria-label="Common schedules" className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button key={preset.value} size="sm" onClick={() => setText(preset.value)} aria-pressed={normalized === preset.value}>
                  {preset.label}
                </Button>
              ))}
            </div>
          </Field>

          <Field
            label="Time zone"
            htmlFor="cron-timezone"
            help="Cron reads schedules in the server's time zone, often UTC. Next runs are worked out in this one."
          >
            <TimeZoneSelect id="cron-timezone" value={zone} onChange={setZone} zones={zones} localZone={localZone} />
          </Field>

          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Syntax</summary>
            <p className="mt-2 text-[color:var(--text-muted)]">
              Five fields: minute, hour, day of month, month and day of week. Each can use:
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {SYNTAX.map(([term, meaning]) => (
                <div key={term} className="contents">
                  <dt className="font-[family-name:var(--font-mono)]">{term}</dt>
                  <dd className="text-[color:var(--text-muted)]">{meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[color:var(--text-muted)]">
              When day of month and day of week are both set, a day matching either one runs, unless one of them starts with *.
            </p>
          </details>
        </div>
      </InputPanel>

      <OutputPanel label="Schedule" copyText={normalized} outputType="cron">
        {result.ok ? (
          <div className="space-y-6">
            <div>
              <p className="font-[family-name:var(--font-ui)] text-lg font-semibold">{describeCron(result.schedule)}</p>
              {daysCombineWithOr(result.schedule) && (
                <p className="mt-1 font-[family-name:var(--font-ui)] text-sm text-[color:var(--text-muted)]">
                  Day of month and day of week are both set, so it runs on days that match either one.
                </p>
              )}
            </div>

            {now !== null && runs !== null && (
              runs.length === 0 ? (
                <Alert title="This schedule never runs" tone="warn">
                  No date matches it, like the 30th of February.
                </Alert>
              ) : (
                <Section label={`${runs.length === 1 ? "Next run" : `Next ${runs.length} runs`} (${zone})`}>
                  <ValueTable
                    rows={runs.map((run) => {
                      const t = formatInTimeZone(run.ms, zone);
                      return {
                        key: String(run.ms),
                        label: relativeTime(run.ms, now),
                        value: `${t.weekday.slice(0, 3)} ${t.date} ${t.time.slice(0, 5)} ${t.abbr}`,
                        note:
                          run.adjustment === "gap"
                            ? "Clocks skip the scheduled time this day for daylight saving, so it runs that much later."
                            : run.adjustment === "ambiguous"
                              ? "The scheduled time happens twice as clocks go back; it runs at the first."
                              : undefined,
                      };
                    })}
                  />
                </Section>
              )
            )}

            <Section label="Fields">
              <ValueTable
                rows={CRON_FIELDS.map((spec) => ({
                  key: spec.id,
                  label: spec.label,
                  value: result.schedule[spec.id].text,
                  note: describeCronField(spec.id, result.schedule[spec.id]),
                }))}
              />
            </Section>
          </div>
        ) : (
          <Alert id={ERROR_ID} title="Can't read this cron expression">
            {result.error}
          </Alert>
        )}
      </OutputPanel>
    </>
  );
}

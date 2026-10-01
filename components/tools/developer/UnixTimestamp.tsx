"use client";

import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TimeZoneSelect from "@/components/ui/TimeZoneSelect";
import ValueTable from "@/components/ui/ValueTable";
import { useNow } from "@/lib/hooks/useNow";
import { useTimeZone } from "@/lib/hooks/useTimeZone";
import { relativeTime } from "@/lib/relative-time";
import { formatInTimeZone } from "@/lib/time-zone";
import { parseTimeInput, type TimeUnit } from "@/lib/tools/developer/unix-time";

const EXAMPLE = "1700000000";

const UNITS = [
  { id: "auto", label: "Auto" },
  { id: "s", label: "s" },
  { id: "ms", label: "ms" },
  { id: "us", label: "µs" },
  { id: "ns", label: "ns" },
] as const;

const UNIT_NAMES: Record<TimeUnit, string> = { s: "seconds", ms: "milliseconds", us: "microseconds", ns: "nanoseconds" };

export default function UnixTimestamp() {
  const now = useNow();
  const [text, setText] = useToolInput(EXAMPLE);
  const [unit, setUnit] = useState<TimeUnit | "auto">("auto");
  const { zone, setZone, localZone, zones } = useTimeZone();
  const result = useMemo(() => parseTimeInput(text, zone, unit), [text, zone, unit]);

  const view = useMemo(() => {
    if (!result.ok) return null;
    const inZone = formatInTimeZone(result.ms, zone);
    return {
      inZone,
      rows: [
        ["Unix seconds", String(Math.floor(result.ms / 1000))],
        ["Unix milliseconds", String(result.ms)],
        [`ISO 8601 (${zone})`, inZone.iso],
        ...(zone === "UTC" ? [] : [["ISO 8601 (UTC)", formatInTimeZone(result.ms, "UTC").iso]]),
        ["RFC 2822 / HTTP", new Date(result.ms).toUTCString()],
        ...(localZone === zone ? [] : [[`Your time (${localZone})`, formatInTimeZone(result.ms, localZone).iso]]),
      ] as [string, string][],
    };
  }, [result, zone, localZone]);

  // Copy the "other side" of the conversion: a date for a timestamp, a timestamp for a date.
  const copyText = result.ok ? (result.kind === "timestamp" ? view?.inZone.iso : String(Math.floor(result.ms / 1000))) : undefined;

  return (
    <>
      <InputPanel label="Timestamp or date">
        <div className="space-y-4">
          <div className="flex gap-2">
            <CodeInput
              aria-label="Timestamp or date"
              value={text}
              onChange={(e) => setText(e.target.value)}
              invalid={!result.ok}
              placeholder="1700000000 or 2026-09-29 14:30"
              className="min-w-0 flex-1"
            />
            <Button icon={Clock} onClick={() => setText(String(Math.floor(Date.now() / 1000)))}>
              Now
            </Button>
          </div>

          <Field label="Timestamp unit" help={unit === "auto" ? "Seconds, milliseconds, microseconds or nanoseconds, guessed from the number's length." : undefined}>
            <SegmentedControl label="Timestamp unit" options={UNITS} value={unit} onChange={setUnit} />
          </Field>

          <Field
            label="Time zone"
            htmlFor="unix-timezone"
            help="Results are shown in this zone. Dates typed without an offset, like 2026-09-29 14:30, are read in it too."
          >
            <TimeZoneSelect id="unix-timezone" value={zone} onChange={setZone} zones={zones} localZone={localZone} />
          </Field>

          {now !== null && (
            <p className="text-sm text-[color:var(--text-muted)]">
              Current Unix time:{" "}
              <button
                type="button"
                onClick={() => setText(String(Math.floor(now / 1000)))}
                className="font-[family-name:var(--font-mono)] text-[color:var(--accent-text)] hover:underline"
              >
                {Math.floor(now / 1000)}
              </button>
            </p>
          )}
        </div>
      </InputPanel>

      <OutputPanel label={result.ok && result.kind === "date" ? "Timestamp" : "Date"} copyText={copyText} outputType={result.ok && result.kind === "timestamp" ? "date" : "timestamp"}>
        {result.ok && view ? (
          <>
            <p className="font-[family-name:var(--font-ui)] text-lg font-semibold">
              {view.inZone.weekday}, {view.inZone.date} {view.inZone.time}{" "}
              <span className="text-[color:var(--text-muted)]">{view.inZone.abbr}</span>
            </p>
            {now !== null && <p className="mt-1 font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">{relativeTime(result.ms, now)}</p>}
            <p className="mt-3 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
              {result.kind === "timestamp"
                ? `Read as ${UNIT_NAMES[result.unit]}${unit === "auto" ? " (detected from its size)" : ""}.`
                : result.zoned
                  ? `Read as a wall-clock time in ${zone}.`
                  : "Read using the offset written in the date."}
            </p>
            {result.kind === "date" && result.adjustment && (
              <p className="mt-2 font-[family-name:var(--font-ui)] text-sm text-[color:var(--accent-warn-text)]">
                {result.adjustment === "gap"
                  ? `This time doesn't exist in ${zone}: clocks jump forward past it for daylight saving. Showing the moment it would have been.`
                  : `This time happens twice in ${zone} when clocks go back. Showing the first one.`}
              </p>
            )}
            <div className="mt-4">
              <ValueTable rows={view.rows.map(([label, value]) => ({ label, value }))} />
            </div>
          </>
        ) : (
          !result.ok && <Alert title="Can't convert this">{result.error}</Alert>
        )}
      </OutputPanel>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import ValueTable from "@/components/ui/ValueTable";
import { useNow } from "@/lib/hooks/useNow";
import {
  formatInTimeZone,
  formatOffset,
  listTimeZones,
  localTimeZone,
  parseTimeInput,
  relativeTime,
  timeZoneOffsetMs,
  type TimeUnit,
} from "@/lib/tools/developer/unix-time";

const EXAMPLE = "1700000000";

const UNITS = [
  { id: "auto", label: "Auto" },
  { id: "s", label: "s" },
  { id: "ms", label: "ms" },
  { id: "us", label: "µs" },
  { id: "ns", label: "ns" },
] as const;

const UNIT_NAMES: Record<TimeUnit, string> = { s: "seconds", ms: "milliseconds", us: "microseconds", ns: "nanoseconds" };

/** Zones grouped by region ("America", "Europe", …), each labelled with its current offset. */
function groupZones(zones: string[], at: number): [string, { zone: string; label: string }[]][] {
  const groups = new Map<string, { zone: string; label: string }[]>();
  for (const zone of zones) {
    const region = zone.includes("/") ? zone.split("/")[0] : "Other";
    const label = `${zone.replace(/_/g, " ")} (UTC${formatOffset(timeZoneOffsetMs(at, zone))})`;
    groups.set(region, [...(groups.get(region) ?? []), { zone, label }]);
  }
  return [...groups];
}

export default function UnixTimestamp() {
  const now = useNow();
  const [text, setText] = useState(EXAMPLE);
  const [unit, setUnit] = useState<TimeUnit | "auto">("auto");
  // Zone data differs between server and browser, so it's filled in after mount.
  const [zone, setZone] = useState("UTC");
  const [localZone, setLocalZone] = useState("UTC");
  const [zones, setZones] = useState<string[]>(["UTC"]);

  useEffect(() => {
    const local = localTimeZone();
    const all = listTimeZones();
    setLocalZone(local);
    setZone(local);
    setZones(all.includes(local) ? all : [...all, local]);
  }, []);

  const zoneGroups = useMemo(() => groupZones(zones, Date.now()), [zones]);
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
            <div className="flex flex-wrap items-center gap-2">
              <Select id="unix-timezone" value={zone} onChange={(e) => setZone(e.target.value)} className="flex-1 basis-56">
                {zoneGroups.map(([region, items]) => (
                  <optgroup key={region} label={region}>
                    {items.map((item) => (
                      <option key={item.zone} value={item.zone}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              <Button onClick={() => setZone(localZone)} aria-pressed={zone === localZone}>
                Local
              </Button>
              <Button onClick={() => setZone("UTC")} aria-pressed={zone === "UTC"}>
                UTC
              </Button>
            </div>
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

      <OutputPanel label={result.ok && result.kind === "date" ? "Timestamp" : "Date"} copyText={copyText}>
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

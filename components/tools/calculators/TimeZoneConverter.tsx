"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { CopyButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TextInput from "@/components/ui/TextInput";
import TimeZoneSelect from "@/components/ui/TimeZoneSelect";
import { useTimeZone } from "@/lib/hooks/useTimeZone";
import { formatOffset, localTimeZone, timeZoneOffsetMs, wallParts } from "@/lib/time-zone";
import {
  dayDifference,
  findTransition,
  formatClock,
  formatDifference,
  formatSpan,
  formatWallDate,
  isDaylightSaving,
  isTimeZone,
  partsOfWall,
  planDay,
  resolveWallTime,
  zoneCity,
  type Occurrence,
  type Transition,
  type WorkingHours,
} from "@/lib/tools/calculators/world-time";
import MeetingPlanner from "./time-zone/MeetingPlanner";
import ZoneList from "./time-zone/ZoneList";

const DEFAULT_ZONES = ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];
const HOUR = 3_600_000;

const CLOCKS = [
  { id: "24", label: "24-hour" },
  { id: "12", label: "12-hour" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Date and time inputs' values for an instant on a zone's clocks. */
function wallInputs(ms: number, zone: string) {
  const p = wallParts(ms, zone);
  return { date: `${String(p.year).padStart(4, "0")}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

function describeTransition(t: Transition, hour12: boolean): string {
  const before = partsOfWall(t.wallBefore);
  const after = partsOfWall(t.wallAfter);
  const direction = t.offsetAfter > t.offsetBefore ? "forward" : "back";
  const abbrs = t.abbrBefore !== t.abbrAfter ? ` (${t.abbrBefore} → ${t.abbrAfter})` : "";
  return `Clocks go ${direction} ${formatSpan(t.offsetAfter - t.offsetBefore)} on ${formatWallDate(before)}: ${formatClock(before.hour, before.minute, hour12)} → ${formatClock(after.hour, after.minute, hour12)}${abbrs}`;
}

function relativeDays(ms: number, from: number): string {
  const days = Math.round((ms - from) / 86_400_000);
  if (days === 0) return ms > from ? "later today" : "earlier today";
  return days > 0 ? `in ${days === 1 ? "1 day" : `${days} days`}` : `${-days === 1 ? "1 day" : `${-days} days`} ago`;
}

export default function TimeZoneConverter() {
  const { zone: from, setZone: setFrom, localZone, zones: allZones } = useTimeZone();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [occurrence, setOccurrence] = useState<Occurrence>("first");
  const [zones, setZones] = useState<string[]>(DEFAULT_ZONES);
  const [clockId, setClockId] = useState<"24" | "12">("24");
  const [work, setWork] = useState<WorkingHours>({ start: 9, end: 17 });
  const [ready, setReady] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>();
  const hour12 = clockId === "12";

  // Read a shared link, or start at the current minute. After mount: the server doesn't know the time or zone.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zone = params.get("from");
    const source = zone && isTimeZone(zone) ? zone : localTimeZone();
    if (zone && isTimeZone(zone)) setFrom(zone);
    const listed = params.get("zones");
    if (listed !== null) setZones(listed.split(",").filter((z) => z && isTimeZone(z)));
    const at = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(params.get("t") ?? "");
    if (at) {
      setDate(at[1]);
      setTime(at[2]);
    } else {
      const now = wallInputs(Date.now(), source);
      setDate(now.date);
      setTime(now.time);
    }
    if (params.get("occ") === "2") setOccurrence("second");
    if (params.get("clock") === "12") setClockId("12");
    setReady(true);
    // Only on mount, after useTimeZone has picked the local zone, so a shared link's zone wins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in step so the address bar is always a link to what's on screen.
  useEffect(() => {
    if (!ready) return;
    const params: [string, string][] = [
      ["t", `${date}T${time}`],
      ["from", from],
      ["zones", zones.join(",")],
    ];
    if (occurrence === "second") params.push(["occ", "2"]);
    if (hour12) params.push(["clock", "12"]);
    // "/", ":" and "," are fine in a query string; leaving them unescaped keeps the link readable.
    const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2F/g, "/").replace(/%3A/g, ":").replace(/%2C/g, ",")}`).join("&");
    const url = new URL(window.location.href);
    url.search = `?${query}`;
    window.history.replaceState(window.history.state, "", url);
    setShareUrl(url.toString());
  }, [ready, date, time, from, zones, occurrence, hour12]);

  const result = useMemo(() => resolveWallTime(date, time, from, occurrence), [date, time, from, occurrence]);
  const shown = useMemo(() => [from, ...zones.filter((z) => z !== from)], [from, zones]);

  const rows = useMemo(() => {
    if (!result.ok) return [];
    const sourceParts = wallParts(result.ms, from);
    const sourceOffset = timeZoneOffsetMs(result.ms, from);
    return shown.map((zone) => {
      const parts = wallParts(result.ms, zone);
      const offset = timeZoneOffsetMs(result.ms, zone);
      return {
        zone,
        parts,
        offset,
        dst: isDaylightSaving(result.ms, zone),
        days: dayDifference(parts, sourceParts),
        difference: formatDifference(offset, sourceOffset),
        next: findTransition(zone, result.ms, 1),
        previous: findTransition(zone, result.ms, -1),
      };
    });
  }, [result, from, shown]);

  const plan = useMemo(() => (result.ok ? planDay(date, from, shown, work) : null), [result.ok, date, from, shown, work]);
  const selectedHour = plan && result.ok ? plan.hours.findIndex((h) => result.ms >= h && result.ms < h + HOUR) : -1;

  const copyText = rows
    .map((r) => `${zoneCity(r.zone)}: ${formatWallDate(r.parts)} ${formatClock(r.parts.hour, r.parts.minute, hour12)} ${r.parts.abbr} (UTC${formatOffset(r.offset)})`)
    .join("\n");

  function setNow() {
    const now = wallInputs(Date.now(), from);
    setDate(now.date);
    setTime(now.time);
    setOccurrence("first");
  }

  /** Use an instant, keeping the same wall time when the source zone changes. */
  function pick(ms: number) {
    const wall = wallInputs(ms, from);
    setDate(wall.date);
    setTime(wall.time);
    const second = resolveWallTime(wall.date, wall.time, from, "second");
    setOccurrence(second.ok && second.adjustment === "ambiguous" && second.ms === ms ? "second" : "first");
  }

  const occurrenceOptions =
    result.ok && result.occurrences
      ? ([
          { id: "first", label: `First, ${wallParts(result.occurrences[0], from).abbr}` },
          { id: "second", label: `Second, ${wallParts(result.occurrences[1], from).abbr}` },
        ] as const)
      : null;

  return (
    <>
      <InputPanel label="Time">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Field label="Date" htmlFor="tz-date">
              <TextInput id="tz-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={ready && !result.ok && !date} />
            </Field>
            <Field label="Time" htmlFor="tz-time">
              <TextInput id="tz-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-invalid={ready && !result.ok && !time} />
            </Field>
            <Button icon={Clock} onClick={setNow}>
              Now
            </Button>
          </div>

          <Field label="In time zone" htmlFor="tz-from">
            <TimeZoneSelect id="tz-from" value={from} onChange={setFrom} zones={allZones} localZone={localZone} />
          </Field>

          {result.ok && result.adjustment === "gap" && (
            <p role="status" className="text-sm text-[color:var(--accent-warn-text)]">
              {time} doesn’t exist in {zoneCity(from)} on this day: the clocks jump forward past it. Showing the moment it would have been,{" "}
              {formatClock(wallParts(result.ms, from).hour, wallParts(result.ms, from).minute, hour12)}.
            </p>
          )}
          {occurrenceOptions && (
            <Field label={`${time} happens twice in ${zoneCity(from)} on this day, as the clocks go back. Which one?`}>
              <SegmentedControl label="Which occurrence" options={occurrenceOptions} value={occurrence} onChange={setOccurrence} />
            </Field>
          )}

          <Field label="Compare with">
            <ZoneList zones={zones} allZones={allZones} onChange={setZones} />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl label="Clock" options={CLOCKS} value={clockId} onChange={setClockId} />
            <span className="text-sm text-[color:var(--text-muted)]">
              <CopyButton text={shareUrl} what="link to this comparison" /> <span aria-hidden>link to this comparison</span>
            </span>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label="Across time zones" copyText={copyText || undefined}>
        {!ready ? null : result.ok ? (
          <div className="space-y-6 font-[family-name:var(--font-ui)]">
            <ul className="divide-y divide-[color:var(--border)]">
              {rows.map((r, i) => (
                <li key={r.zone} className="flex items-start gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {zoneCity(r.zone)}
                      {i === 0 && <span className="ml-2 text-xs font-normal text-[color:var(--text-muted)]">from</span>}
                    </p>
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                      <span className="font-[family-name:var(--font-mono)]">{formatClock(r.parts.hour, r.parts.minute, hour12)}</span>
                      {r.days !== 0 && (
                        <span className="ml-2 align-middle text-xs font-medium text-[color:var(--accent-warn-text)]">
                          {r.days > 0 ? "+" : "−"}
                          {Math.abs(r.days)} day{Math.abs(r.days) === 1 ? "" : "s"}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-[color:var(--text-muted)]">
                      {formatWallDate(r.parts)} · {r.parts.abbr} · UTC{formatOffset(r.offset)}
                      {i > 0 && ` · ${r.difference}`}
                      {r.dst && (
                        <span className="ml-2 rounded border border-[color:var(--border)] px-1.5 py-0.5 text-xs text-[color:var(--text)]" title="Daylight saving time is in effect">
                          DST
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-xs text-[color:var(--text-muted)]">
                    <CopyButton
                      text={`${formatWallDate(r.parts)} ${formatClock(r.parts.hour, r.parts.minute, hour12)} ${r.parts.abbr} (${r.zone})`}
                      what={`${zoneCity(r.zone)} time`}
                    />
                  </span>
                </li>
              ))}
            </ul>

            <section aria-labelledby="tz-dst">
              <h3 id="tz-dst" className="text-sm font-semibold">
                Clock changes
              </h3>
              <ul className="mt-2 space-y-2 text-sm">
                {rows.map((r) => (
                  <li key={r.zone}>
                    <span className="font-medium">{zoneCity(r.zone)}:</span>{" "}
                    {r.next || r.previous ? (
                      <>
                        {r.next && (
                          <span className="block text-[color:var(--text-muted)]">
                            Next: {describeTransition(r.next, hour12)}, {relativeDays(r.next.at, result.ms)}.
                          </span>
                        )}
                        {r.previous && (
                          <span className="block text-[color:var(--text-muted)]">
                            Last: {describeTransition(r.previous, hour12)}, {relativeDays(r.previous.at, result.ms)}.
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[color:var(--text-muted)]">No clock changes within a year either side.</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">From your browser’s time zone data. Governments change rules at short notice, so check dates far ahead.</p>
            </section>
          </div>
        ) : (
          <Alert title="Can't convert this">{result.error}</Alert>
        )}
      </OutputPanel>

      {ready && plan && (
        <OutputPanel label="Meeting planner" wide>
          <MeetingPlanner plan={plan} zones={shown} selected={selectedHour} hour12={hour12} work={work} onWorkChange={setWork} onPick={pick} />
        </OutputPanel>
      )}
    </>
  );
}


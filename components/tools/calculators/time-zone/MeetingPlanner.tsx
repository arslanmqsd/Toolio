"use client";

import { useEffect, useRef } from "react";
import { wallParts } from "@/lib/time-zone";
import { formatClock, runs, zoneCity, type HourKind, type PlannerDay, type WorkingHours } from "@/lib/tools/calculators/world-time";
import Select from "@/components/ui/Select";

interface MeetingPlannerProps {
  plan: PlannerDay;
  /** Zones in row order; the first is the one the day belongs to. */
  zones: string[];
  /** Hour index holding the chosen time, if it's on this day. */
  selected: number;
  hour12: boolean;
  work: WorkingHours;
  onWorkChange: (work: WorkingHours) => void;
  onPick: (ms: number) => void;
}

const HOUR = 3_600_000;

const kindClass: Record<HourKind, string> = {
  work: "bg-[color:color-mix(in_srgb,var(--accent)_24%,transparent)] text-[color:var(--text)]",
  day: "text-[color:var(--text)]",
  night: "bg-[color:color-mix(in_srgb,var(--text)_8%,transparent)] text-[color:var(--text-muted)]",
};

/** Compact hour for a cell: "9", "9:30", or "9a" / "9:30p" on a 12-hour clock. */
function cellLabel(hour: number, minute: number, hour12: boolean): string {
  const mm = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return hour12 ? `${hour % 12 || 12}${mm}${hour < 12 ? "a" : "p"}` : `${hour}${mm}`;
}

const HOURS = Array.from({ length: 25 }, (_, i) => i);

/** One row per zone, one column per hour of the day, with working hours shaded. Click a column to pick that hour. */
export default function MeetingPlanner({ plan, zones, selected, hour12, work, onWorkChange, onPick }: MeetingPlannerProps) {
  const source = zones[0];
  const clock = (ms: number) => {
    const p = wallParts(ms, source);
    return formatClock(p.hour, p.minute, hour12);
  };
  const overlaps = runs(plan.overlap);
  const scroller = useRef<HTMLDivElement>(null);

  // Bring the chosen hour into view on narrow screens, without scrolling the page.
  useEffect(() => {
    const box = scroller.current;
    const cell = box?.querySelector<HTMLElement>("[data-selected]");
    if (box && cell) box.scrollLeft = cell.offsetLeft - box.clientWidth / 2 + cell.offsetWidth / 2;
  }, [selected, plan]);

  return (
    <div className="space-y-3 font-[family-name:var(--font-ui)]">
      <div role="group" aria-labelledby="tz-work-label" className="flex flex-wrap items-center gap-2 text-sm">
        <span id="tz-work-label">Working hours</span>
        <Select aria-label="Start" value={work.start} onChange={(e) => onWorkChange({ ...work, start: Number(e.target.value) })} className="w-28">
          {HOURS.slice(0, 24).map((h) => (
            <option key={h} value={h} disabled={h >= work.end}>
              {formatClock(h, 0, hour12)}
            </option>
          ))}
        </Select>
        <span aria-hidden>to</span>
        <Select aria-label="End" value={work.end} onChange={(e) => onWorkChange({ ...work, end: Number(e.target.value) })} className="w-28">
          {HOURS.slice(1).map((h) => (
            <option key={h} value={h} disabled={h <= work.start}>
              {h === 24 ? (hour12 ? "12:00 AM" : "24:00") : formatClock(h, 0, hour12)}
            </option>
          ))}
        </Select>
        <span className="text-[color:var(--text-muted)]">in each zone</span>
      </div>

      <p className="text-sm" aria-live="polite">
        {overlaps.length ? (
          <>
            Everyone is in working hours{" "}
            {overlaps.map(([a, b], i) => (
              <span key={a}>
                {i > 0 && (i === overlaps.length - 1 ? " and " : ", ")}
                <strong>
                  {clock(plan.hours[a])}–{clock(plan.hours[b] + HOUR)}
                </strong>
              </span>
            ))}{" "}
            {zoneCity(source)} time.
          </>
        ) : (
          <span className="text-[color:var(--text-muted)]">No hour of this day is inside working hours in every zone.</span>
        )}
      </p>

      <div ref={scroller} className="relative overflow-x-auto rounded-md border border-[color:var(--border)]">
        <table className="border-separate border-spacing-0 text-xs">
          <caption className="sr-only">
            Each hour of the day in {zoneCity(source)}, and what time it is in each zone. Choose an hour in the first row to use it.
          </caption>
          <thead>
            <tr aria-hidden>
              <td className="sticky left-0 bg-[color:var(--surface)]" />
              {plan.hours.map((ms, i) => (
                <td key={ms} className="h-1.5 p-0">
                  {plan.overlap.includes(i) && <div className="mx-0.5 h-1.5 rounded-full bg-[color:var(--accent)]" />}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.cells.map((row, z) => (
              <tr key={zones[z]}>
                <th scope="row" className="sticky left-0 z-10 max-w-32 truncate border-r border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-left font-medium">
                  {zoneCity(zones[z])}
                </th>
                {row.map((cell, i) => {
                  const label = cellLabel(cell.hour, cell.minute, hour12);
                  const newDay = i === 0 || row[i - 1].dayOffset !== cell.dayOffset;
                  const isSelected = i === selected;
                  const content = (
                    <>
                      <span className="block font-[family-name:var(--font-mono)]">{label}</span>
                      <span className="block h-3 text-[10px] leading-3 text-[color:var(--text-muted)]">{newDay ? cell.weekday.slice(0, 3) : ""}</span>
                    </>
                  );
                  const cls = `min-w-9 border-b border-[color:var(--border)] px-1 py-1 text-center ${kindClass[cell.kind]} ${newDay && i > 0 ? "border-l border-l-[color:var(--text-muted)]" : ""} ${
                    isSelected ? "shadow-[inset_0_0_0_2px_var(--accent)]" : ""
                  }`;
                  return z === 0 ? (
                    <td key={plan.hours[i]} className={cls} data-selected={isSelected || undefined}>
                      <button
                        type="button"
                        onClick={() => onPick(plan.hours[i])}
                        aria-pressed={isSelected}
                        aria-label={`Use ${formatClock(cell.hour, cell.minute, hour12)} ${zoneCity(zones[0])} time`}
                        className="w-full rounded hover:bg-[color:color-mix(in_srgb,var(--accent)_20%,transparent)]"
                      >
                        {content}
                      </button>
                    </td>
                  ) : (
                    <td key={plan.hours[i]} className={cls}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-3 w-3 rounded-sm ${kindClass.work}`} /> Working hours
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-3 w-3 rounded-sm border border-[color:var(--border)] ${kindClass.night}`} /> Night (22:00–07:00)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-1.5 w-3 rounded-full bg-[color:var(--accent)]" /> Everyone working
        </span>
      </p>
    </div>
  );
}

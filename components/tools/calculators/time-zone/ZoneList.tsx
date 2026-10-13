"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import Select from "@/components/ui/Select";
import { groupZones } from "@/components/ui/TimeZoneSelect";
import { zoneCity } from "@/lib/tools/calculators/world-time";

interface ZoneListProps {
  zones: string[];
  /** Every zone to pick from, from useTimeZone. */
  allZones: string[];
  onChange: (zones: string[]) => void;
}

const iconButton = "rounded p-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--text)] disabled:opacity-40 disabled:hover:text-[color:var(--text-muted)]";

/** The zones to compare against: reorder, remove, and add from a grouped list. */
export default function ZoneList({ zones, allZones, onChange }: ZoneListProps) {
  const groups = useMemo(() => groupZones(allZones, Date.now()), [allZones]);

  function move(index: number, by: -1 | 1) {
    const next = [...zones];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {zones.length > 0 && (
        <ul className="divide-y divide-[color:var(--border)] rounded-md border border-[color:var(--border)]">
          {zones.map((zone, i) => (
            <li key={zone} className="flex items-center gap-2 py-1 pl-3 pr-1">
              <span className="min-w-0 flex-1 truncate text-sm">
                {zoneCity(zone)}
                {zoneCity(zone) !== zone && <span className="ml-2 text-xs text-[color:var(--text-muted)]">{zone}</span>}
              </span>
              <button type="button" className={iconButton} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${zoneCity(zone)} up`}>
                <ArrowUp aria-hidden className="h-4 w-4" />
              </button>
              <button type="button" className={iconButton} onClick={() => move(i, 1)} disabled={i === zones.length - 1} aria-label={`Move ${zoneCity(zone)} down`}>
                <ArrowDown aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={`${iconButton} hover:text-[color:var(--error)]`}
                onClick={() => onChange(zones.filter((z) => z !== zone))}
                aria-label={`Remove ${zoneCity(zone)}`}
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Select
        aria-label="Add a time zone"
        value=""
        onChange={(e) => {
          const zone = e.target.value;
          if (zone && !zones.includes(zone)) onChange([...zones, zone]);
        }}
      >
        <option value="">Add a time zone…</option>
        {groups.map(([region, items]) => (
          <optgroup key={region} label={region}>
            {items.map((item) => (
              <option key={item.zone} value={item.zone} disabled={zones.includes(item.zone)}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </div>
  );
}

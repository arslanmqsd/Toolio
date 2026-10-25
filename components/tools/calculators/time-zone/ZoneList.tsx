"use client";

import { useMemo } from "react";
import ReorderList from "@/components/ui/ReorderList";
import Select from "@/components/ui/Select";
import { groupZones } from "@/components/ui/TimeZoneSelect";
import { zoneCity } from "@/lib/tools/calculators/world-time";

interface ZoneListProps {
  zones: string[];
  /** Every zone to pick from, from useTimeZone. */
  allZones: string[];
  onChange: (zones: string[]) => void;
}

/** The zones to compare against: reorder, remove, and add from a grouped list. */
export default function ZoneList({ zones, allZones, onChange }: ZoneListProps) {
  const groups = useMemo(() => groupZones(allZones, Date.now()), [allZones]);

  return (
    <div className="space-y-2">
      {zones.length > 0 && (
        <ReorderList
          items={zones}
          getKey={(zone) => zone}
          getName={zoneCity}
          onChange={onChange}
          renderItem={(zone) => (
            <span className="block truncate">
              {zoneCity(zone)}
              {zoneCity(zone) !== zone && <span className="ml-2 text-xs text-[color:var(--text-muted)]">{zone}</span>}
            </span>
          )}
        />
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

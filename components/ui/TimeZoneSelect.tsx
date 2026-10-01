"use client";

import { useMemo } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { formatOffset, timeZoneOffsetMs } from "@/lib/time-zone";

interface TimeZoneSelectProps {
  id: string;
  value: string;
  onChange: (zone: string) => void;
  /** From useTimeZone. */
  zones: string[];
  localZone: string;
}

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

/** Time zone picker with Local and UTC shortcuts. Pair with useTimeZone. */
export default function TimeZoneSelect({ id, value, onChange, zones, localZone }: TimeZoneSelectProps) {
  const groups = useMemo(() => groupZones(zones, Date.now()), [zones]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 basis-56">
        {groups.map(([region, items]) => (
          <optgroup key={region} label={region}>
            {items.map((item) => (
              <option key={item.zone} value={item.zone}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <Button onClick={() => onChange(localZone)} aria-pressed={value === localZone}>
        Local
      </Button>
      <Button onClick={() => onChange("UTC")} aria-pressed={value === "UTC"}>
        UTC
      </Button>
    </div>
  );
}

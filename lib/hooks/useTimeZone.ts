"use client";

import { useEffect, useState } from "react";
import { listTimeZones, localTimeZone } from "@/lib/time-zone";

/** A chosen time zone that starts as the viewer's own, plus every zone to pick from. */
export function useTimeZone() {
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

  return { zone, setZone, localZone, zones };
}

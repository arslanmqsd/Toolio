"use client";

import { useEffect, useState } from "react";

/** Current time, ticking every second while enabled. Null during SSR and the first client render. */
export function useNow(enabled = true): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

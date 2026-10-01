const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Rough distance from `now`, like "3 days ago" or "in 2 hours". */
export function relativeTime(ms: number, now: number): string {
  const seconds = (ms - now) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFormat.format(Math.round(seconds), "second");
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3600), "hour");
  const days = seconds / 86_400;
  if (Math.abs(days) < 30) return relativeFormat.format(Math.round(days), "day");
  if (Math.abs(days) < 365) return relativeFormat.format(Math.round(days / 30.44), "month");
  return relativeFormat.format(Math.round(days / 365.25), "year");
}

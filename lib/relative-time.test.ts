import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

const T = 1_700_000_000_000; // 2023-11-14T22:13:20Z
const HOUR = 3_600_000;

describe("relativeTime", () => {
  it.each([
    [0, "now"],
    [-30_000, "30 seconds ago"],
    [90_000, "in 2 minutes"],
    [-3 * HOUR, "3 hours ago"],
    [-24 * HOUR, "yesterday"],
    [5 * 24 * HOUR, "in 5 days"],
    [-60 * 24 * HOUR, "2 months ago"],
    [800 * 24 * HOUR, "in 2 years"],
  ])("%d ms → %s", (delta, text) => {
    expect(relativeTime(T + delta, T)).toBe(text);
  });
});

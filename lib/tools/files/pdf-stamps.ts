/** Rubber stamps for the PDF editor: the standard set, and how any stamp is laid out on the page. */

import type { Box, PathCmd } from "./pdf-editor";
import { hexRgb } from "./pdf-colors";

/** A box with the words inside, a flag pointing left (like "Sign here"), or a tick or cross with no words. */
export type StampShape = "box" | "flag" | "check" | "cross";

export interface Stamp {
  text: string;
  /** Hex colour of the words and border; the inside is a paler tint of it. */
  color: string;
  shape: StampShape;
}

const GREEN = "#3d6b21";
const BLUE = "#1f2a68";
const RED = "#9a1c1c";

export const STANDARD_STAMPS: Stamp[] = [
  ...["APPROVED", "COMPLETED", "FINAL"].map((text) => ({ text, color: GREEN, shape: "box" as const })),
  ...["AS IS", "CONFIDENTIAL", "DEPARTMENTAL", "DRAFT", "EXPERIMENTAL", "FOR COMMENT", "FOR PUBLIC RELEASE", "INFORMATION ONLY"].map((text) => ({
    text,
    color: BLUE,
    shape: "box" as const,
  })),
  ...["EXPIRED", "NOT APPROVED"].map((text) => ({ text, color: RED, shape: "box" as const })),
  ...["NOT FOR PUBLIC RELEASE", "PRELIMINARY RESULTS", "SOLD", "TOP SECRET"].map((text) => ({ text, color: BLUE, shape: "box" as const })),
  { text: "VOID", color: RED, shape: "box" },
  { text: "SIGN HERE", color: "#c0503c", shape: "flag" },
  { text: "WITNESS", color: "#c9a800", shape: "flag" },
  { text: "INITIAL HERE", color: "#6a5acd", shape: "flag" },
  { text: "", color: "#4f9a2b", shape: "check" },
  { text: "", color: "#c0392b", shape: "cross" },
];

/** A name for a stamp in lists and for screen readers. */
export function stampName(stamp: Stamp): string {
  return stamp.shape === "check" ? "Check mark" : stamp.shape === "cross" ? "Cross" : stamp.text;
}

/** Mixes a hex colour toward white by `amount` (0 keeps it, 1 is white). */
function tint(hex: string, amount: number): string {
  return `#${hexRgb(hex)
    .map((c) => Math.round((c + (1 - c) * amount) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Height of a new stamp, in points. */
const HEIGHT: Record<StampShape, number> = { box: 28, flag: 18, check: 24, cross: 24 };
/** Words fill this share of a stamp's height at most. */
const TEXT_SHARE = 0.55;

/** Where the words may go across a stamp, as offsets from its left and right edges, in heights. */
const TEXT_INSET: Record<"box" | "flag", [number, number]> = { box: [0.4, 0.4], flag: [0.65, 0.35] };

/**
 * The size of a new stamp, in points. `widthAt1` is the words' width at size 1 in the stamp font (Helvetica
 * Bold Oblique), so the box hugs them.
 */
export function stampSize(stamp: Stamp, widthAt1: (text: string) => number): { width: number; height: number } {
  const height = HEIGHT[stamp.shape];
  if (stamp.shape === "check" || stamp.shape === "cross") return { width: height, height };
  const [left, right] = TEXT_INSET[stamp.shape];
  return { width: widthAt1(stamp.text) * height * TEXT_SHARE + (left + right) * height, height };
}

export interface StampLayout {
  /** The border, filled with `fill` and outlined in the stamp's colour. */
  frame: PathCmd[] | null;
  fill: string;
  frameWidth: number;
  /** A tick or cross, stroked with round ends. */
  mark: PathCmd[] | null;
  markWidth: number;
  /** The words: centred on `cx`, sitting on `baseline`, shrunk to fit if the stamp was squeezed. */
  text: { cx: number; baseline: number; size: number; color: string } | null;
}

/** How a stamp in a box on the page as seen is drawn, so the screen and the saved PDF match. */
export function stampLayout(item: Stamp & Box, widthAt1: (text: string) => number): StampLayout {
  const { x, y, width: w, height: h, color } = item;
  const none = { frame: null, fill: color, frameWidth: 0, mark: null, markWidth: Math.max(1.5, Math.min(w, h) * 0.14), text: null };
  if (item.shape === "check") {
    return { ...none, mark: [{ op: "M", p: [x + 0.15 * w, y + 0.55 * h] }, { op: "L", p: [x + 0.4 * w, y + 0.8 * h] }, { op: "L", p: [x + 0.88 * w, y + 0.2 * h] }] };
  }
  if (item.shape === "cross") {
    const [a, b] = [0.2, 0.8];
    return {
      ...none,
      mark: [
        { op: "M", p: [x + a * w, y + a * h] },
        { op: "L", p: [x + b * w, y + b * h] },
        { op: "M", p: [x + b * w, y + a * h] },
        { op: "L", p: [x + a * w, y + b * h] },
      ],
    };
  }
  const flag = item.shape === "flag";
  let frame: PathCmd[];
  if (flag) {
    frame = [{ op: "M", p: [x + h / 2, y] }, { op: "L", p: [x + w, y] }, { op: "L", p: [x + w, y + h] }, { op: "L", p: [x + h / 2, y + h] }, { op: "L", p: [x, y + h / 2] }, { op: "Z" }];
  } else {
    // A rounded box: straight sides joined by quarter curves.
    const r = Math.min(h * 0.18, w / 2);
    const k = r * 0.4477; // 1 - KAPPA: how far in from the corner each curve's control points sit.
    frame = [
      { op: "M", p: [x + r, y] },
      { op: "L", p: [x + w - r, y] },
      { op: "C", c1: [x + w - k, y], c2: [x + w, y + k], p: [x + w, y + r] },
      { op: "L", p: [x + w, y + h - r] },
      { op: "C", c1: [x + w, y + h - k], c2: [x + w - k, y + h], p: [x + w - r, y + h] },
      { op: "L", p: [x + r, y + h] },
      { op: "C", c1: [x + k, y + h], c2: [x, y + h - k], p: [x, y + h - r] },
      { op: "L", p: [x, y + r] },
      { op: "C", c1: [x, y + k], c2: [x + k, y], p: [x + r, y] },
      { op: "Z" },
    ];
  }
  const [left, right] = TEXT_INSET[item.shape as "box" | "flag"];
  const room = Math.max(1, w - (left + right) * h);
  const size = Math.min(h * TEXT_SHARE, room / Math.max(0.01, widthAt1(item.text)));
  return {
    frame,
    fill: tint(color, flag ? 0.45 : 0.85),
    frameWidth: Math.max(0.75, h * 0.04),
    mark: null,
    markWidth: 0,
    text: item.text ? { cx: x + left * h + room / 2, baseline: y + h / 2 + size * 0.35, size, color: flag ? "#000000" : color } : null,
  };
}

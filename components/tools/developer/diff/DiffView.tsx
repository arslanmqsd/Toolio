"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { collapseRows } from "@/lib/tools/developer/diff/hunks";
import { markChanged, plainPieces, type SideHighlights } from "@/lib/tools/developer/diff/highlight";
import type { Hunk, Row } from "@/lib/tools/developer/diff/model";
import { toSplitLines } from "@/lib/tools/developer/diff/split";

export type DiffLayout = "split" | "unified";

/** Split view needs two readable columns; narrower screens get unified. */
export const SPLIT_QUERY = "(min-width: 640px)";

/** Rows drawn before a "Show all" button, so a huge diff can't freeze the page. */
export const ROW_LIMIT = 2000;

type Side = "old" | "new";

interface DiffViewProps {
  hunks: Hunk[];
  layout: DiffLayout;
  /** Unchanged lines kept around each change; "all" shows every row; "none" shows hunks as given (a pasted diff). */
  context: number | "all" | "none";
  highlights?: SideHighlights | null;
}

type Item =
  | { type: "header"; key: string; text: string }
  | { type: "skipped"; key: string; from: number; to: number }
  | { type: "gap"; key: string; count: number }
  | { type: "rows"; key: string; rows: Row[] };

const rowTint: Record<Row["kind"], string> = {
  add: "bg-[color:var(--diff-add-bg)]",
  remove: "bg-[color:var(--diff-remove-bg)]",
  context: "",
  ignored: "text-[color:var(--text-muted)]",
};
const markers: Record<Row["kind"], string> = { add: "+", remove: "−", context: "", ignored: "" };
const spoken: Record<Row["kind"], string> = { add: "Added line: ", remove: "Removed line: ", context: "", ignored: "Ignored line: " };
const wordTint: Partial<Record<Row["kind"], string>> = {
  add: "rounded-sm bg-[color:var(--diff-add-word)]",
  remove: "rounded-sm bg-[color:var(--diff-remove-word)]",
};

const gutterClass = "w-[1%] select-none whitespace-nowrap px-2 text-right align-top text-[color:var(--text-muted)]";
const markerClass = "w-[1%] select-none pl-1 align-top";
const codeClass = "whitespace-pre-wrap px-2 align-top [overflow-wrap:anywhere]";

/** Draws one file's hunks, split or unified. Knows nothing about where the diff came from. */
export default function DiffView({ hunks, layout, context, highlights }: DiffViewProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const items: Item[] = [];
  hunks.forEach((hunk, h) => {
    if (hunk.skippedBefore) items.push({ type: "skipped", key: `${h}:skipped`, ...hunk.skippedBefore });
    if (hunk.header) items.push({ type: "header", key: `${h}:header`, text: hunk.header });
    const blocks = context === "none" ? [{ kind: "rows" as const, start: 0, rows: hunk.rows }] : collapseRows(hunk.rows, context);
    for (const block of blocks) {
      const key = `${h}:${block.start}`;
      if (block.kind === "rows") items.push({ type: "rows", key, rows: block.rows });
      else if (expanded.has(key)) items.push({ type: "rows", key, rows: hunk.rows.slice(block.start, block.end) });
      else items.push({ type: "gap", key, count: block.end - block.start });
    }
  });

  const total = items.reduce((n, item) => n + (item.type === "rows" ? item.rows.length : 0), 0);
  let budget = showAll ? Infinity : ROW_LIMIT;
  const shown: Item[] = [];
  for (const item of items) {
    if (budget <= 0) break;
    if (item.type === "rows") {
      shown.push({ ...item, rows: item.rows.slice(0, budget) });
      budget -= item.rows.length;
    } else {
      shown.push(item);
    }
  }

  const columns = layout === "split" ? 6 : 4;
  const expand = (key: string) => setExpanded((prev) => new Set(prev).add(key));

  return (
    <div className="space-y-3">
      <table className="w-full border-collapse font-[family-name:var(--font-mono)] text-xs leading-5">
        <tbody>
          {shown.map((item) => {
            if (item.type === "header" || item.type === "skipped") {
              return (
                <tr key={item.key}>
                  <td colSpan={columns} className="bg-[color:var(--diff-empty)] px-2 py-1 text-[color:var(--text-muted)]">
                    {item.type === "header" ? item.text : `⋯ Lines ${item.from}–${item.to} aren't in this diff`}
                  </td>
                </tr>
              );
            }
            if (item.type === "gap") {
              return (
                <tr key={item.key}>
                  <td colSpan={columns} className="p-0">
                    <button
                      type="button"
                      onClick={() => expand(item.key)}
                      className="w-full bg-[color:var(--diff-empty)] px-2 py-1 text-left font-[family-name:var(--font-ui)] text-[color:var(--accent-text)] hover:underline"
                    >
                      ⋯ Show {item.count} unchanged {item.count === 1 ? "line" : "lines"}
                    </button>
                  </td>
                </tr>
              );
            }
            return layout === "split" ? (
              toSplitLines(item.rows).map((line, i) => (
                <tr key={`${item.key}:${i}`}>
                  <SplitHalf row={line.left} side="old" highlights={highlights} />
                  <SplitHalf row={line.right} side="new" highlights={highlights} />
                </tr>
              ))
            ) : (
              item.rows.map((row, i) => (
                <tr key={`${item.key}:${i}`} className={rowTint[row.kind]}>
                  <td className={gutterClass}>{row.oldNo}</td>
                  <td className={gutterClass}>{row.newNo}</td>
                  <td aria-hidden className={`${markerClass} ${markerColor(row)}`}>
                    {markers[row.kind]}
                  </td>
                  <td className={codeClass}>
                    <Code row={row} side={row.kind === "remove" || (row.kind === "ignored" && row.oldNo !== undefined) ? "old" : "new"} highlights={highlights} />
                  </td>
                </tr>
              ))
            );
          })}
        </tbody>
      </table>
      {total > ROW_LIMIT && !showAll && (
        <Button size="sm" onClick={() => setShowAll(true)}>
          Show all {total} rows
        </Button>
      )}
    </div>
  );
}

function markerColor(row: Row): string {
  if (row.kind === "add") return "text-[color:var(--diff-add-text)]";
  if (row.kind === "remove") return "text-[color:var(--diff-remove-text)]";
  return "";
}

/** One side of a split-view line; an empty side is shaded. */
function SplitHalf({ row, side, highlights }: { row?: Row; side: Side; highlights?: SideHighlights | null }) {
  if (!row) return <td colSpan={3} className="bg-[color:var(--diff-empty)]" />;
  const tint = row.kind === "context" ? "" : rowTint[row.kind];
  return (
    <>
      <td className={`${gutterClass} ${tint}`}>{side === "old" ? row.oldNo : row.newNo}</td>
      <td aria-hidden className={`${markerClass} ${tint} ${markerColor(row)}`}>
        {markers[row.kind]}
      </td>
      <td className={`${codeClass} w-1/2 ${tint}`}>
        <Code row={row} side={side} highlights={highlights} />
      </td>
    </>
  );
}

/** A row's text on one side: syntax pieces when highlighted, with changed words marked. */
function Code({ row, side, highlights }: { row: Row; side: Side; highlights?: SideHighlights | null }) {
  const text = side === "old" ? (row.oldText ?? row.text) : row.text;
  const no = side === "old" ? row.oldNo : row.newNo;
  const base = (no !== undefined ? highlights?.[side].get(no) : undefined) ?? plainPieces(text);
  const pieces = markChanged(base, row.words ?? []);
  return (
    <>
      {spoken[row.kind] && <span className="sr-only">{spoken[row.kind]}</span>}
      {pieces.map((piece, i) => (
        <span key={i} className={`${piece.classes.join(" ")} ${piece.changed ? (wordTint[row.kind] ?? "") : ""}`}>
          {piece.text}
        </span>
      ))}
    </>
  );
}

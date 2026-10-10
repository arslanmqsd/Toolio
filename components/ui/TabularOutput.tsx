import type { ReactNode } from "react";
import ResultNotices from "@/components/ui/ResultNotices";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TablePreview from "@/components/ui/TablePreview";
import type { Notice } from "@/lib/notices";

export type TabularView = "text" | "table";

interface TabularOutputProps {
  /** A line about the result, like "3 rows × 4 columns". */
  summary: ReactNode;
  notices: Notice[];
  /** The text view's name in the view switch, like "CSV". */
  textLabel: string;
  text: string;
  table: { header: string[] | null; rows: string[][]; rowCount: number; columnCount: number };
  /** Names the table for screen readers. */
  tableLabel: string;
  view: TabularView;
  onView: (view: TabularView) => void;
}

/** A result that is a table: a summary, notices, and the output as text or as a table preview. */
export default function TabularOutput({ summary, notices, textLabel, text, table, tableLabel, view, onView }: TabularOutputProps) {
  const views = [
    { id: "text", label: textLabel },
    { id: "table", label: "Table" },
  ] as const;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 font-[family-name:var(--font-ui)]">
        <p className="text-xs tabular-nums text-[color:var(--text-muted)]">{summary}</p>
        <SegmentedControl label="Output view" options={views} value={view} onChange={onView} />
      </div>
      <ResultNotices notices={notices} />
      {view === "table" ? (
        <TablePreview header={table.header} rows={table.rows} rowCount={table.rowCount} columnCount={table.columnCount} label={tableLabel} />
      ) : (
        <pre className="whitespace-pre [tab-size:8]">{text}</pre>
      )}
    </>
  );
}

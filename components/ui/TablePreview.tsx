interface TablePreviewProps {
  /** Column names, or null to number the columns. */
  header: string[] | null;
  /** The rows shown; may be the first few of `rowCount`. */
  rows: string[][];
  rowCount: number;
  columnCount: number;
  /** Names the table for screen readers. */
  label: string;
}

/** A scrollable grid of the first rows of tabular data, with row numbers and a sticky header. */
export default function TablePreview({ header, rows, rowCount, columnCount, label }: TablePreviewProps) {
  const columns = header ?? Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
  const cell = "max-w-[20rem] border-b border-r border-[color:var(--border)] px-2 py-1 align-top";
  return (
    <div className="font-[family-name:var(--font-ui)]">
      <div className="max-h-[32rem] overflow-auto rounded-md border border-[color:var(--border)]">
        <table className="w-max min-w-full border-collapse text-xs">
          <caption className="sr-only">
            {label}
            {rows.length < rowCount ? `, first ${rows.length} of ${rowCount} rows` : ""}
          </caption>
          <thead className="sticky top-0 bg-[color:var(--surface)]">
            <tr>
              <th scope="col" className={`${cell} text-right font-normal text-[color:var(--text-muted)]`}>
                <span className="sr-only">Row</span>
              </th>
              {columns.map((name, i) => (
                <th key={i} scope="col" className={`${cell} whitespace-nowrap text-left font-semibold`}>
                  {name === "" ? <span className="font-normal italic text-[color:var(--text-muted)]">(no name)</span> : name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-[family-name:var(--font-mono)]">
            {rows.map((row, r) => (
              <tr key={r}>
                <th scope="row" className={`${cell} text-right font-normal tabular-nums text-[color:var(--text-muted)]`}>
                  {r + 1}
                </th>
                {Array.from({ length: Math.max(columns.length, row.length) }, (_, c) => (
                  <td key={c} className={`${cell} whitespace-pre-wrap break-words`}>
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length < rowCount && (
        <p className="mt-2 text-xs text-[color:var(--text-muted)]">
          Showing the first {rows.length.toLocaleString("en-US")} of {rowCount.toLocaleString("en-US")} rows.
        </p>
      )}
    </div>
  );
}

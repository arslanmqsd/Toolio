import type { ReactNode } from "react";
import { CopyButton } from "@/components/tool-shell/ToolPanels";

export interface ValueRow {
  label: ReactNode;
  value: string;
  /** Extra line under the value, e.g. a warning. */
  note?: ReactNode;
  /** Draws attention to the row, e.g. a checksum that matched. */
  highlight?: "match" | "mismatch";
  key?: string;
}

/** Label / value rows, each with its own copy button. */
export default function ValueTable({ rows }: { rows: ValueRow[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.key ?? (typeof row.label === "string" ? row.label : i)}
            className={`border-t border-[color:var(--border)] ${
              row.highlight === "match"
                ? "bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
                : row.highlight === "mismatch"
                  ? "bg-[color:color-mix(in_srgb,var(--error)_10%,transparent)]"
                  : ""
            }`}
          >
            <th scope="row" className="py-2 pl-1 pr-4 text-left align-top font-[family-name:var(--font-ui)] font-normal text-[color:var(--text-muted)]">
              {row.label}
            </th>
            <td className="break-all py-2 pr-2">
              {row.value}
              {row.note && <div className="mt-1 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">{row.note}</div>}
            </td>
            <td className="py-2 pr-1 text-right align-top text-xs text-[color:var(--text-muted)]">
              <CopyButton text={row.value} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

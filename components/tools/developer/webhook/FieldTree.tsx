"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { CopyButton } from "@/components/tool-shell/ToolPanels";
import { formatPath, type FieldRow, type PathStyle } from "@/lib/tools/developer/webhook/inspect";

const typeColor: Record<FieldRow["type"], string> = {
  object: "text-[color:var(--text-muted)]",
  array: "text-[color:var(--text-muted)]",
  string: "text-[color:var(--accent-text)]",
  number: "text-[color:var(--accent-warn-text)]",
  boolean: "text-[color:var(--accent-warn-text)]",
  null: "text-[color:var(--text-muted)]",
};

/** Every field as an indented, collapsible list, each with its type, value and a button to copy its path. */
export default function FieldTree({ rows, pathStyle }: { rows: FieldRow[]; pathStyle: PathStyle }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    // Ids are JSON paths like ["a",0]; a descendant's id starts with its ancestor's minus the closing bracket.
    const hidden: string[] = [];
    return rows.filter((row) => {
      if (hidden.some((prefix) => row.id.startsWith(prefix))) return false;
      if (collapsed.has(row.id)) hidden.push(row.path.length ? `${row.id.slice(0, -1)},` : "[");
      return true;
    });
  }, [rows, collapsed]);

  function toggle(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  }

  return (
    <ul className="text-sm">
      {visible.map((row) => {
        const last = row.path[row.path.length - 1];
        const isContainer = row.count !== undefined;
        const open = !collapsed.has(row.id);
        const path = formatPath(row.path, pathStyle);
        return (
          <li key={row.id} className="flex items-start gap-2 border-t border-[color:var(--border)] py-1.5 first:border-t-0" style={{ paddingLeft: `${row.depth * 1}rem` }}>
            {isContainer && row.count ? (
              <button
                type="button"
                onClick={() => toggle(row.id)}
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} ${path}`}
                className="mt-0.5 rounded text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
              >
                <ChevronRight aria-hidden className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span aria-hidden className="w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{last === undefined ? "(root)" : typeof last === "number" ? `[${last}]` : last}</span>
                <span className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">{row.type}</span>
                <span className={`min-w-0 truncate ${typeColor[row.type]}`} title={row.preview}>
                  {isContainer ? (row.type === "array" ? `${row.count} item${row.count === 1 ? "" : "s"}` : `${row.count} key${row.count === 1 ? "" : "s"}`) : row.preview}
                </span>
              </div>
              {row.hint && <p className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">{row.hint}</p>}
            </div>
            <span className="shrink-0 text-xs text-[color:var(--text-muted)]">
              <CopyButton text={path} what={`path ${path}`} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

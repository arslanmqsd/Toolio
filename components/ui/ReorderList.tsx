import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";

interface ReorderListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  /** Names the item in the move and remove buttons' labels, e.g. "Move report.pdf up". */
  getName: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onChange: (items: T[]) => void;
}

const iconButton = "rounded p-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--text)] disabled:opacity-40 disabled:hover:text-[color:var(--text-muted)]";

/** A bordered list whose rows can be moved up and down or removed. */
export default function ReorderList<T>({ items, getKey, getName, renderItem, onChange }: ReorderListProps<T>) {
  function move(index: number, by: -1 | 1) {
    const next = [...items];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  }

  return (
    <ul className="divide-y divide-[color:var(--border)] rounded-md border border-[color:var(--border)]">
      {items.map((item, i) => (
        <li key={getKey(item)} className="flex items-center gap-2 py-1 pl-3 pr-1">
          <div className="min-w-0 flex-1 text-sm">{renderItem(item, i)}</div>
          <button type="button" className={iconButton} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${getName(item)} up`}>
            <ArrowUp aria-hidden className="h-4 w-4" />
          </button>
          <button type="button" className={iconButton} onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${getName(item)} down`}>
            <ArrowDown aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${iconButton} hover:text-[color:var(--error)]`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={`Remove ${getName(item)}`}
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

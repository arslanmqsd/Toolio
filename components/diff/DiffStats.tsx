import type { Stats } from "@/lib/diff/model";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "+12 −4 · 30 unchanged", or with `files` "3 files changed +12 −4". Shared by both diff tools. */
export default function DiffStats({ stats, files }: { stats: Stats; files?: number }) {
  const spoken = [
    files !== undefined ? `${plural(files, "file")} changed` : null,
    `${plural(stats.added, "line")} added`,
    `${stats.removed} removed`,
    files === undefined ? `${stats.unchanged} unchanged` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
      <span className="sr-only">{spoken}</span>
      {files !== undefined && <span aria-hidden>{plural(files, "file")} changed</span>}
      <span aria-hidden className="font-[family-name:var(--font-mono)] text-[color:var(--diff-add-text)]">
        +{stats.added}
      </span>
      <span aria-hidden className="font-[family-name:var(--font-mono)] text-[color:var(--diff-remove-text)]">
        −{stats.removed}
      </span>
      {files === undefined && (
        <span aria-hidden className="text-[color:var(--text-muted)]">
          · {stats.unchanged} unchanged
        </span>
      )}
    </p>
  );
}

import { formatBytes } from "@/lib/format-bytes";
import type { SizeChange } from "@/lib/gzip-size";

const percentSaved = (before: number, after: number) => (before === 0 ? 0 : Math.round((1 - after / before) * 100));

/** "12 KB → 8 KB (33% smaller) · gzipped 3 KB → 2.8 KB", for a formatter's or minifier's output. */
export default function SizeSummary({ sizes }: { sizes: SizeChange }) {
  const saved = percentSaved(sizes.input, sizes.output);
  return (
    <p className="mb-4 font-[family-name:var(--font-ui)] text-xs tabular-nums text-[color:var(--text-muted)]">
      {formatBytes(sizes.input)} → <span className="font-medium text-[color:var(--text)]">{formatBytes(sizes.output)}</span>
      {saved > 0 && <> ({saved}% smaller)</>}
      {saved < 0 && <> ({-saved}% larger)</>}
      <span aria-hidden="true"> · </span>
      <span className="whitespace-nowrap">
        gzipped {formatBytes(sizes.inputGzip)} → {formatBytes(sizes.outputGzip)}
      </span>
    </p>
  );
}

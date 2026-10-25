import type { ReactNode } from "react";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import { formatBytes } from "@/lib/format-bytes";

interface SelectedFileProps {
  file: File;
  onClear: () => void;
  /** Extra facts after the size, e.g. "12 pages". */
  detail?: ReactNode;
}

/** The chosen file's name and size, with a button to clear it. Pairs with FileDrop. */
export default function SelectedFile({ file, onClear, detail }: SelectedFileProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[color:var(--border)] p-3 text-sm">
      <span className="min-w-0 break-all">
        {file.name}{" "}
        <span className="text-[color:var(--text-muted)]">
          ({formatBytes(file.size)}
          {detail && <>, {detail}</>})
        </span>
      </span>
      <Button icon={X} size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

import Button from "@/components/ui/Button";

interface TaskProgressProps {
  /** What's happening now, e.g. "Compressing image 3 of 12…". */
  label: string;
  /** 0–1, or undefined for a step that can't say how far along it is. */
  value?: number;
  onCancel: () => void;
}

/** Progress bar with a Cancel button, for slow work on files. */
export default function TaskProgress({ label, value, onCancel }: TaskProgressProps) {
  return (
    <div className="space-y-3 font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">
      <p>{label}</p>
      <progress value={value} max={1} aria-label={label} className="h-1.5 w-full accent-[color:var(--accent)]" />
      <Button size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

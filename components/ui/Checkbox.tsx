import type { ReactNode } from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/** Labelled checkbox for tool options. */
export default function Checkbox({ checked, onChange, children }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[color:var(--accent)]"
      />
      {children}
    </label>
  );
}

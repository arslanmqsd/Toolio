import type { ReactNode } from "react";

interface FieldProps {
  label: ReactNode;
  /** id of the control the label points at. */
  htmlFor?: string;
  help?: ReactNode;
  children: ReactNode;
}

/** A labelled control with optional help text underneath. */
export default function Field({ label, htmlFor, help, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-[color:var(--text-muted)]">{help}</p>}
    </div>
  );
}

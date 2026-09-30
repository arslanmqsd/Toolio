import type { ReactNode } from "react";

interface FieldProps {
  label: ReactNode;
  /** id of the control the label points at. */
  htmlFor?: string;
  help?: ReactNode;
  /** A small control on the label's row, like "Forgot password?". Kept outside the <label>. */
  action?: ReactNode;
  children: ReactNode;
}

/** A labelled control with optional help text underneath. */
export default function Field({ label, htmlFor, help, action, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
        {action}
      </div>
      {children}
      {help && <p className="text-xs text-[color:var(--text-muted)]">{help}</p>}
    </div>
  );
}

import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

/**
 * A form's error message, placed just above its submit button. Fields point at it with aria-describedby
 * and set aria-invalid; role="alert" announces it when it appears.
 */
export default function FormError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex gap-2 rounded-md border border-[color:color-mix(in_srgb,var(--error)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--error)_10%,transparent)] px-3 py-2 text-sm text-[color:var(--text)]"
    >
      <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--error)]" />
      <span>{children}</span>
    </p>
  );
}

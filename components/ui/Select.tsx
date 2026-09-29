import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

/** Native select styled to match the other fields. Native keeps type-to-find, mobile pickers and screen reader support. */
const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", children, ...props },
  ref,
) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <select
        ref={ref}
        className="w-full appearance-none rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-2 pl-3 pr-9 text-sm text-[color:var(--text)] hover:border-[color:var(--accent)] focus:outline focus:outline-1 focus:outline-[color:var(--accent)]"
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]" />
    </div>
  );
});

export default Select;

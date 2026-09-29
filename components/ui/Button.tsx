import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide icon shown before the label. */
  icon?: LucideIcon;
  size?: "sm" | "md";
}

/** Outlined secondary button used for tool actions ("Now", "Use result as input", …). */
export default function Button({ icon: Icon, size = "md", type = "button", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 font-[family-name:var(--font-ui)] text-sm text-[color:var(--text)] hover:border-[color:var(--accent)] disabled:opacity-50 disabled:hover:border-[color:var(--border)] ${
        size === "sm" ? "py-1" : "py-1.5"
      } ${className}`}
      {...props}
    >
      {Icon && <Icon aria-hidden className="h-4 w-4" />}
      {children}
    </button>
  );
}

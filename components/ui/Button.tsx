import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[color:var(--accent)] font-medium text-[color:var(--on-accent)] hover:bg-[color:color-mix(in_srgb,var(--accent)_86%,white)] disabled:hover:bg-[color:var(--accent)]",
  secondary:
    "border-[color:var(--border)] text-[color:var(--text)] hover:border-[color:var(--accent)] disabled:hover:border-[color:var(--border)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1",
  md: "px-3 py-1.5",
  lg: "px-5 py-2.5",
};

/** Button styling, also for links that look like buttons. */
export function buttonClass({ variant = "secondary", size = "md" }: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return `inline-flex items-center justify-center gap-2 rounded-md border font-[family-name:var(--font-ui)] text-sm disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide icon shown before the label. */
  icon?: LucideIcon;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Secondary (outlined) by default, for tool actions ("Now", "Use result as input", …); primary for the main action. */
export default function Button({
  icon: Icon,
  variant,
  size,
  type = "button",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`${buttonClass({ variant, size })} ${className}`} {...props}>
      {Icon && <Icon aria-hidden className="h-4 w-4" />}
      {children}
    </button>
  );
}

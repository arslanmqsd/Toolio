import type { ReactNode } from "react";

interface AlertProps {
  title: ReactNode;
  children?: ReactNode;
  tone?: "error" | "warn";
  /** Lets inputs point at the alert with aria-describedby. */
  id?: string;
}

const tones = {
  error: { border: "border-[color:color-mix(in_srgb,var(--error)_40%,transparent)]", text: "text-[color:var(--error)]" },
  warn: { border: "border-[color:color-mix(in_srgb,var(--accent-warn)_40%,transparent)]", text: "text-[color:var(--accent-warn-text)]" },
};

/** Boxed message shown in place of a tool's output when it can't produce one. */
export default function Alert({ title, children, tone = "error", id }: AlertProps) {
  return (
    <div id={id} role="alert" className={`rounded-md border p-4 font-[family-name:var(--font-ui)] ${tones[tone].border}`}>
      <p className={`font-semibold ${tones[tone].text}`}>{title}</p>
      {children && <div className={`mt-1 break-words ${tone === "error" ? tones.error.text : ""}`}>{children}</div>}
    </div>
  );
}

import { TriangleAlert } from "lucide-react";
import type { Danger } from "@/lib/tools/developer/git/types";

export const dangerTitles: Record<Danger, string> = {
  safe: "Safe",
  caution: "Use with care",
  destructive: "Can lose work",
};

const tones: Record<Exclude<Danger, "safe">, string> = {
  caution: "border-[color:color-mix(in_srgb,var(--accent-warn)_40%,transparent)] text-[color:var(--accent-warn-text)]",
  destructive: "border-[color:color-mix(in_srgb,var(--error)_40%,transparent)] text-[color:var(--error)]",
};

/** Flags caution and destructive tasks and steps with an icon and text, never colour alone. Nothing for safe ones. */
export default function DangerBadge({ danger }: { danger: Danger }) {
  if (danger === "safe") return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-[family-name:var(--font-ui)] text-xs ${tones[danger]}`}
    >
      <TriangleAlert aria-hidden className="h-3 w-3" />
      {dangerTitles[danger]}
    </span>
  );
}

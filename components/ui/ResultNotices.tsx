import ThingsToCheck from "@/components/ui/ThingsToCheck";
import type { Notice } from "@/lib/notices";

/** A result's warnings as things to check, then its notes on what was done, quieter. */
export default function ResultNotices({ notices }: { notices: Notice[] }) {
  const warnings = notices.filter((n) => n.kind === "warning").map((n) => n.message);
  const info = notices.filter((n) => n.kind === "info").map((n) => n.message);
  return (
    <>
      <ThingsToCheck items={warnings} />
      {info.length > 0 && (
        <ul className="mb-4 space-y-1 border-b border-[color:var(--border)] pb-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
          {info.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </>
  );
}

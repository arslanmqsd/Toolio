import { AlertTriangle, Info, XCircle } from "lucide-react";
import type { Issue } from "@/lib/tools/developer/nginx/validate";

const styles: Record<Issue["level"], string> = {
  error: "text-[color:var(--error)]",
  warning: "text-[color:var(--accent-warn-text)]",
  info: "text-[color:var(--text-muted)]",
};

export function IssueIcon({ level, className = "mt-px h-3.5 w-3.5 shrink-0" }: { level: Issue["level"]; className?: string }) {
  if (level === "error") return <XCircle aria-label="Error" className={`${className} ${styles.error}`} />;
  if (level === "warning") return <AlertTriangle aria-label="Warning" className={`${className} ${styles.warning}`} />;
  return <Info aria-label="Note" className={`${className} ${styles.info}`} />;
}

/** Messages for one field or block, with an id the field can point at. */
export default function IssueList({ id, issues }: { id?: string; issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul id={id} className="space-y-1 text-xs">
      {issues.map((issue) => (
        <li key={issue.message} className={`flex gap-1.5 ${styles[issue.level]}`}>
          <IssueIcon level={issue.level} />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

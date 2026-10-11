"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput } from "@/components/ui/CodeField";
import type { MakeId, UpstreamServer } from "@/lib/tools/developer/nginx/model";
import type { Issue } from "@/lib/tools/developer/nginx/validate";
import IssueList from "./IssueList";

interface UpstreamEditorProps {
  servers: UpstreamServer[];
  issues: Issue[];
  makeId: MakeId;
  onChange: (servers: UpstreamServer[]) => void;
}

const iconButton = "rounded p-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--text)] disabled:opacity-40 disabled:hover:text-[color:var(--text-muted)]";

/** Upstream servers as rows: address, weight, backup, and buttons to reorder and remove. */
export default function UpstreamEditor({ servers, issues, makeId, onChange }: UpstreamEditorProps) {
  const update = (id: string, patch: Partial<UpstreamServer>) => onChange(servers.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  function move(index: number, by: -1 | 1) {
    const next = [...servers];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {servers.map((s, i) => {
          const own = issues.filter((issue) => issue.upstreamId === s.id);
          const name = s.address.trim() || `server ${i + 1}`;
          return (
            <li key={s.id} className="space-y-1">
              <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_auto_auto]">
                <CodeInput aria-label={`Upstream server ${i + 1} address`} value={s.address} onChange={(e) => update(s.id, { address: e.target.value })} placeholder="127.0.0.1:3000" invalid={own.some((x) => x.level === "error")} />
                <CodeInput aria-label={`Upstream server ${i + 1} weight`} value={s.weight} onChange={(e) => update(s.id, { weight: e.target.value })} placeholder="weight" inputMode="numeric" />
                <Checkbox checked={s.backup} onChange={(backup) => update(s.id, { backup })}>
                  Backup
                </Checkbox>
                <div className="flex justify-end">
                  <button type="button" className={iconButton} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${name} up`}>
                    <ArrowUp aria-hidden className="h-4 w-4" />
                  </button>
                  <button type="button" className={iconButton} onClick={() => move(i, 1)} disabled={i === servers.length - 1} aria-label={`Move ${name} down`}>
                    <ArrowDown aria-hidden className="h-4 w-4" />
                  </button>
                  <button type="button" className={`${iconButton} hover:text-[color:var(--error)]`} onClick={() => onChange(servers.filter((x) => x.id !== s.id))} aria-label={`Remove ${name}`}>
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <IssueList issues={own} />
            </li>
          );
        })}
      </ul>
      <Button size="sm" icon={Plus} onClick={() => onChange([...servers, { id: makeId(), address: "", weight: "", backup: false }])}>
        Add server
      </Button>
    </div>
  );
}

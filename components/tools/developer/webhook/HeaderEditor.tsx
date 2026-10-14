"use client";

import { Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { CodeInput } from "@/components/ui/CodeField";

export interface HeaderRow {
  id: number;
  name: string;
  value: string;
}

interface HeaderEditorProps {
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
}

const CREDENTIAL = /authorization|token|api[-_]?key|secret|password|cookie|auth/i;
const TOKEN_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Headers that look like they carry a credential, which would end up in the command and shell history. */
export const credentialHeaders = (rows: HeaderRow[]) => rows.filter((r) => r.name.trim() && (CREDENTIAL.test(r.name) || /^bearer\s/i.test(r.value.trim())));

/** Extra request headers as name/value rows. */
export default function HeaderEditor({ rows, onChange }: HeaderEditorProps) {
  const update = (id: number, patch: Partial<HeaderRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const risky = credentialHeaders(rows);

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const badName = r.name.trim() !== "" && !TOKEN_NAME.test(r.name.trim());
            return (
              <li key={r.id} className="space-y-1">
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2">
                  <CodeInput aria-label={`Header ${i + 1} name`} value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} placeholder="X-Event-Type" invalid={badName} spellCheck={false} />
                  <CodeInput aria-label={`Header ${i + 1} value`} value={r.value} onChange={(e) => update(r.id, { value: e.target.value })} placeholder="order.paid" spellCheck={false} />
                  <button
                    type="button"
                    onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                    aria-label={`Remove header ${r.name.trim() || i + 1}`}
                    className="rounded p-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--error)]"
                  >
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                </div>
                {badName && <p className="text-xs text-[color:var(--error)]">Header names can’t contain spaces, colons or quotes.</p>}
              </li>
            );
          })}
        </ul>
      )}
      <Button size="sm" icon={Plus} onClick={() => onChange([...rows, { id: nextId, name: "", value: "" }])}>
        Add header
      </Button>
      {risky.length > 0 && (
        <p className="text-xs text-[color:var(--accent-warn-text)]">
          {risky.map((r) => r.name.trim()).join(", ")} look{risky.length === 1 ? "s" : ""} like a credential. It goes into the generated command as typed, so it
          ends up in your shell history; use a test value.
        </p>
      )}
    </div>
  );
}

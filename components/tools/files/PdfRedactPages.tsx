"use client";

import { useId, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import TextInput from "@/components/ui/TextInput";
import { plural } from "@/lib/notices";
import { chosenPages, type PageChoice } from "@/lib/tools/files/pdf-redact";

const CHOICES: { id: PageChoice; label: string }[] = [
  { id: "current", label: "Current page" },
  { id: "specify", label: "Specify pages" },
  { id: "odd", label: "Odd pages only" },
  { id: "even", label: "Even pages only" },
];

/** "1, 3, 5" for a short list, "1, 3, 5 … 19" for a long one. */
const pageList = (pages: number[]) => (pages.length <= 8 ? pages.map((i) => i + 1).join(", ") : `${pages.slice(0, 6).map((i) => i + 1).join(", ")} … ${pages[pages.length - 1] + 1}`);

/** Picks whole pages to black out: the current one, typed pages, or every odd or even page. */
export function RedactPagesDialog({
  open,
  onClose,
  current,
  pageCount,
  onMark,
}: {
  open: boolean;
  onClose: () => void;
  /** Zero-based. */
  current: number;
  pageCount: number;
  onMark: (pages: number[]) => void;
}) {
  const [choice, setChoice] = useState<PageChoice>("current");
  const [spec, setSpec] = useState("");
  const name = useId();
  const specId = useId();
  const summaryId = useId();
  const result = chosenPages(choice, current, spec, pageCount);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (result.ok) onMark(result.pages);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Black out whole pages" description="Each page you pick is saved fully black.">
      <form onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Pages</legend>
          {CHOICES.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name={name} value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="h-4 w-4 accent-[color:var(--accent)]" />
              {c.label}
              {c.id === "current" && <span className="text-[color:var(--text-muted)]">({current + 1})</span>}
            </label>
          ))}
        </fieldset>
        {choice === "specify" && (
          <div className="space-y-1.5">
            <label htmlFor={specId} className="block text-sm">
              Pages, like 1-3, 5 or 8-
            </label>
            <TextInput
              id={specId}
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder={`1-${pageCount}`}
              aria-invalid={!result.ok && spec.trim() !== ""}
              aria-describedby={summaryId}
              autoFocus
            />
          </div>
        )}
        <p id={summaryId} aria-live="polite" className={`text-sm ${!result.ok && (choice !== "specify" || spec.trim()) ? "text-[color:var(--error)]" : "text-[color:var(--text-muted)]"}`}>
          {result.ok ? `${plural(result.pages.length, "page", "pages")}: ${pageList(result.pages)}` : result.error}
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!result.ok}>
            Add marks
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

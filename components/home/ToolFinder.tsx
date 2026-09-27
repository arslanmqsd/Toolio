"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { IconTile } from "@/components/catalog/icons";
import { search } from "@/lib/search/search";
import { toolHref } from "@/registry";

const EXAMPLE = "I need to check when my JWT expires";

export default function ToolFinder() {
  const router = useRouter();
  const [task, setTask] = useState(EXAMPLE);
  const results = useMemo(() => search(task, 3), [task]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (results[0]) router.push(toolHref(results[0].tool));
  }

  return (
    <section
      aria-labelledby="finder-heading"
      className="grid grid-cols-1 gap-6 rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-6 sm:p-8 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-center"
    >
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <Sparkles aria-hidden className="mt-1 h-6 w-6 shrink-0 text-[color:var(--accent-text)]" />
          <div>
            <h2 id="finder-heading" className="text-xl font-semibold tracking-[-0.01em]">
              Don&apos;t know which tool you need?
            </h2>
            <p className="mt-1 text-[color:var(--text-muted)]">Describe what you&apos;re trying to do.</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="finder-input" className="sr-only">
            Describe your task
          </label>
          <input
            id="finder-input"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-raised)] px-4 py-2.5 text-sm outline-none focus:border-[color:var(--accent)]"
          />
          <button
            type="submit"
            disabled={results.length === 0}
            className="rounded-lg bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[color:color-mix(in_srgb,var(--accent)_88%,white)] disabled:opacity-50"
          >
            Find a tool
          </button>
        </form>
      </div>

      <div
        aria-live="polite"
        className="min-w-0 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-4"
      >
        {task.trim() === "" ? (
          <p className="text-sm text-[color:var(--text-muted)]">Matching tools appear here.</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-[color:var(--text-muted)]">
            No tool matches that yet. Try other words, like &ldquo;decode&rdquo; or &ldquo;convert&rdquo;.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm font-semibold">
              Toolio found {results.length} {results.length === 1 ? "tool" : "tools"}
            </p>
            <ul className="space-y-1">
              {results.map(({ tool }) => (
                <li key={tool.id}>
                  <Link
                    href={toolHref(tool)}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]"
                  >
                    <IconTile category={tool.category} toolId={tool.id} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{tool.title}</span>
                      <span className="block truncate text-xs text-[color:var(--text-muted)]">
                        {tool.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

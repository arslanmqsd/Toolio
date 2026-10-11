"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import { maxDanger } from "@/lib/tools/developer/git/build";
import { GIT_CATEGORIES, TASKS } from "@/lib/tools/developer/git/catalog";
import { searchTasks } from "@/lib/tools/developer/git/search";
import type { GitCategoryId, Task } from "@/lib/tools/developer/git/types";
import DangerBadge from "./DangerBadge";

// Worked out once: it builds every checkbox and select combination of every task.
const DANGER = new Map(TASKS.map((task) => [task.id, maxDanger(task)]));

const chipClass = "aria-pressed:border-[color:var(--accent)] aria-pressed:text-[color:var(--accent-text)]";

interface TaskPickerProps {
  query: string;
  onQueryChange: (query: string) => void;
  category: GitCategoryId | null;
  onCategoryChange: (category: GitCategoryId | null) => void;
  /** Highlighted at first, e.g. the task the user just came back from. */
  initialActiveId: string | null;
  onSelect: (task: Task) => void;
  focusOnMount: boolean;
}

/** Search box and category chips over the task list, as an ARIA combobox: arrows move, Enter picks. */
export default function TaskPicker({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  initialActiveId,
  onSelect,
  focusOnMount,
}: TaskPickerProps) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState(initialActiveId);
  const searching = query.trim() !== "";

  useEffect(() => {
    if (focusOnMount) input.current?.focus();
  }, [focusOnMount]);

  const visible = useMemo(() => {
    const tasks = searching ? searchTasks(query).map((m) => m.item) : TASKS;
    return category ? tasks.filter((t) => t.category === category) : tasks;
  }, [query, category, searching]);

  // While searching, the best match is active until the user moves.
  const found = visible.findIndex((t) => t.id === activeId);
  const current = found >= 0 ? found : searching && visible.length > 0 ? 0 : -1;
  const optionId = (task: Task) => `${listId}-${task.id}`;

  function move(by: number) {
    if (visible.length === 0) return;
    const next = current < 0 ? (by > 0 ? 0 : visible.length - 1) : (current + by + visible.length) % visible.length;
    setActiveId(visible[next].id);
    document.getElementById(optionId(visible[next]))?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && current >= 0) {
      e.preventDefault();
      onSelect(visible[current]);
    }
  }

  function option(task: Task) {
    const index = visible.indexOf(task);
    return (
      <div
        key={task.id}
        id={optionId(task)}
        role="option"
        aria-selected={index === current}
        onClick={() => onSelect(task)}
        onMouseMove={() => setActiveId(task.id)}
        className={`flex cursor-pointer items-start justify-between gap-3 rounded-md px-3 py-2 ${
          index === current ? "bg-[color:var(--control-selected)] ring-1 ring-[color:var(--border)]" : ""
        }`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{task.title}</span>
          <span className="block text-xs text-[color:var(--text-muted)]">{task.summary}</span>
        </span>
        <DangerBadge danger={DANGER.get(task.id) ?? "safe"} />
      </div>
    );
  }

  const groups = searching ? null : GIT_CATEGORIES.map((c) => ({ ...c, tasks: visible.filter((t) => t.category === c.id) }));

  return (
    <div className="space-y-4">
      <SearchInput
        ref={input}
        value={query}
        onChange={onQueryChange}
        label="Search Git tasks"
        placeholder="undo last commit, delete branch…"
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={current >= 0 ? optionId(visible[current]) : undefined}
        onKeyDown={onKeyDown}
      />

      <div role="group" aria-label="Categories" className="flex flex-wrap gap-2">
        <Button size="sm" className={chipClass} aria-pressed={category === null} onClick={() => onCategoryChange(null)}>
          All
        </Button>
        {GIT_CATEGORIES.map((c) => (
          <Button
            key={c.id}
            size="sm"
            className={chipClass}
            aria-pressed={category === c.id}
            onClick={() => onCategoryChange(category === c.id ? null : c.id)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {visible.length === 1 ? "1 task" : `${visible.length} tasks`}
      </p>

      {visible.length === 0 ? (
        <div className="py-6 text-center text-sm text-[color:var(--text-muted)]">
          <p>No matching task.</p>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              onQueryChange("");
              onCategoryChange(null);
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div id={listId} role="listbox" aria-label="Git tasks" className="max-h-[32rem] space-y-1 overflow-y-auto">
          {groups
            ? groups
                .filter((g) => g.tasks.length > 0)
                .map((g) => (
                  <div key={g.id} role="group" aria-labelledby={`${listId}-${g.id}-label`}>
                    <div id={`${listId}-${g.id}-label`} className="px-3 pb-1 pt-3 text-xs font-medium text-[color:var(--accent-text)]">
                      {g.label}
                    </div>
                    {g.tasks.map(option)}
                  </div>
                ))
            : visible.map(option)}
        </div>
      )}
    </div>
  );
}

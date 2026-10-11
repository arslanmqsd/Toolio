"use client";

import { useEffect, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useQueryParam } from "@/lib/hooks/useQueryParam";
import { commandText, defaultValues, presetValues, resolveTask } from "@/lib/command-builder/build";
import { addHistory, readHistory, storableValues, writeHistory, type HistoryEntry } from "@/lib/command-builder/history";
import type { Catalog, FieldValue, FieldValues, Shell } from "@/lib/command-builder/types";
import { relativeTime } from "@/lib/relative-time";
import type { DataType } from "@/registry";
import CommandOutput, { needsConfirm } from "./CommandOutput";
import TaskForm from "./TaskForm";
import TaskPicker from "./TaskPicker";

const SHELLS = [
  { id: "posix", label: "Bash / Zsh" },
  { id: "powershell", label: "PowerShell" },
] as const;

interface CommandBuilderProps {
  catalog: Catalog;
  outputType: DataType;
  /** Offer Bash/Zsh and PowerShell versions, and splitting long commands over lines. */
  shells?: boolean;
  /** localStorage key for recently copied commands. Leave out for no history. */
  historyKey?: string;
}

/** A task picker, its form and the explained command: the frame of the Git and Docker builders. */
export default function CommandBuilder({ catalog, outputType, shells = false, historyKey }: CommandBuilderProps) {
  const [taskParam, setTaskParam] = useQueryParam("task");
  // An unknown ?task= falls back to the list.
  const task = (taskParam && catalog.getTask(taskParam)) || null;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  // Values belong to one task: switching tasks starts again from that task's defaults.
  const [form, setForm] = useState<{ taskId: string; values: FieldValues } | null>(null);
  // Where focus goes after the user changes view; nothing moves it on first load.
  const [focus, setFocus] = useState<"form" | "picker" | null>(null);
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);
  const [shell, setShell] = useState<Shell>("posix");
  const [multiline, setMultiline] = useState(true);
  // A confirmation covers one task and what was agreed to: turning on a riskier option asks again.
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Read after mounting: storage only exists in the browser, and the first render must match the server's.
  useEffect(() => {
    if (historyKey) setHistory(readHistory(historyKey, catalog.getTask));
  }, [historyKey, catalog]);

  const values = task ? (form?.taskId === task.id ? form.values : defaultValues(task)) : null;
  const resolved = task && values ? resolveTask(task, values, shell) : null;
  const format = shells ? { shell, multiline } : undefined;
  const ready = resolved?.status === "ready" ? resolved : null;
  const text = ready ? commandText(ready.steps, format) : "";
  const confirmKey = task && resolved && resolved.status !== "invalid" ? `${task.id}|${resolved.steps.map((s) => s.confirm ?? "").join("|")}` : null;
  const confirmed = confirmKey !== null && confirmedFor === confirmKey;
  const gated = ready ? needsConfirm(ready.steps) && !confirmed : false;

  function open(id: string, startValues?: FieldValues) {
    const next = catalog.getTask(id);
    setForm(next && startValues ? { taskId: id, values: { ...defaultValues(next), ...startValues } } : null);
    setFocus("form");
    setTaskParam(id);
  }

  function back() {
    setLastTaskId(task?.id ?? null);
    setFocus("picker");
    setTaskParam(null);
  }

  function change(id: string, value: FieldValue) {
    if (task && values) setForm({ taskId: task.id, values: { ...values, [id]: value } });
  }

  function applyPreset(presetId: string) {
    if (task) setForm({ taskId: task.id, values: presetValues(task, presetId) });
  }

  function remember() {
    if (!historyKey || !task || !values) return;
    const next = addHistory(history, { taskId: task.id, values: storableValues(task, values), at: Date.now() });
    setHistory(next);
    writeHistory(historyKey, next);
  }

  function clearHistory() {
    if (!historyKey) return;
    setHistory([]);
    writeHistory(historyKey, []);
  }

  return (
    <>
      <InputPanel label="What do you want to do?">
        {task && values ? (
          <TaskForm
            key={task.id}
            catalog={catalog}
            task={task}
            values={values}
            errors={resolved?.status === "invalid" ? resolved.errors : {}}
            onChange={change}
            onPreset={applyPreset}
            onBack={back}
            focusOnMount={focus === "form"}
          />
        ) : (
          <div className="space-y-6">
            <TaskPicker
              catalog={catalog}
              query={query}
              onQueryChange={setQuery}
              category={category}
              onCategoryChange={setCategory}
              initialActiveId={lastTaskId}
              onSelect={(t) => open(t.id)}
              focusOnMount={focus === "picker"}
            />
            {historyKey && history.length > 0 && (
              <section aria-labelledby={`${catalog.idPrefix}-history`} className="space-y-2 border-t border-[color:var(--border)] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 id={`${catalog.idPrefix}-history`} className="flex items-center gap-1.5 text-sm font-medium">
                    <History aria-hidden className="h-4 w-4" />
                    Recently copied
                  </h2>
                  <Button size="sm" icon={Trash2} onClick={clearHistory}>
                    Clear history
                  </Button>
                </div>
                <p className="text-xs text-[color:var(--text-muted)]">Kept in this browser only, without environment values or user names.</p>
                <ul className="space-y-1">
                  {history.map((entry) => (
                    <li key={`${entry.taskId}-${entry.at}`}>
                      <button
                        type="button"
                        onClick={() => open(entry.taskId, entry.values)}
                        className="flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm hover:bg-[color:var(--control-selected)]"
                      >
                        <span className="min-w-0 truncate">{catalog.getTask(entry.taskId)?.title}</span>
                        <span className="shrink-0 text-xs text-[color:var(--text-muted)]">{relativeTime(entry.at, Date.now())}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </InputPanel>
      <OutputPanel label="Command" copyText={gated ? undefined : text || undefined} outputType={outputType} onCopy={remember}>
        {shells && (
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-[family-name:var(--font-ui)]">
            <SegmentedControl label="Shell" options={SHELLS} value={shell} onChange={setShell} />
            <Checkbox checked={multiline} onChange={setMultiline}>
              Split long commands over lines
            </Checkbox>
          </div>
        )}
        {shell === "powershell" && text.includes('"') && (
          <p className="mb-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--accent-warn-text)]">
            This command passes double quotes to Docker. PowerShell 7.3 and later pass them as written; Windows PowerShell 5.1 drops them, so
            use PowerShell 7 or avoid &quot; in values.
          </p>
        )}
        <CommandOutput
          catalog={catalog}
          task={task}
          resolved={resolved}
          format={format}
          confirmed={confirmed}
          onConfirmedChange={(on) => setConfirmedFor(on ? confirmKey : null)}
          onSelectTask={(id) => open(id)}
          onCopy={remember}
        />
      </OutputPanel>
    </>
  );
}

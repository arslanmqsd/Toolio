"use client";

import { useState } from "react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import { useQueryParam } from "@/lib/hooks/useQueryParam";
import { commandText, defaultValues, resolveTask } from "@/lib/tools/developer/git/build";
import { getTask } from "@/lib/tools/developer/git/catalog";
import type { FieldValue, FieldValues, GitCategoryId } from "@/lib/tools/developer/git/types";
import CommandOutput from "./git/CommandOutput";
import TaskForm from "./git/TaskForm";
import TaskPicker from "./git/TaskPicker";

export default function GitCommandBuilder() {
  const [taskParam, setTaskParam] = useQueryParam("task");
  // An unknown ?task= falls back to the list.
  const task = (taskParam && getTask(taskParam)) || null;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GitCategoryId | null>(null);
  // Values belong to one task: switching tasks starts again from that task's defaults.
  const [form, setForm] = useState<{ taskId: string; values: FieldValues } | null>(null);
  // Where focus goes after the user changes view; nothing moves it on first load.
  const [focus, setFocus] = useState<"form" | "picker" | null>(null);
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);

  const values = task ? (form?.taskId === task.id ? form.values : defaultValues(task)) : null;
  const resolved = task && values ? resolveTask(task, values) : null;

  function open(id: string) {
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

  return (
    <>
      <InputPanel label="What do you want to do?">
        {task && values ? (
          <TaskForm
            key={task.id}
            task={task}
            values={values}
            errors={resolved?.status === "invalid" ? resolved.errors : {}}
            onChange={change}
            onBack={back}
            focusOnMount={focus === "form"}
          />
        ) : (
          <TaskPicker
            query={query}
            onQueryChange={setQuery}
            category={category}
            onCategoryChange={setCategory}
            initialActiveId={lastTaskId}
            onSelect={(t) => open(t.id)}
            focusOnMount={focus === "picker"}
          />
        )}
      </InputPanel>
      <OutputPanel label="Command" copyText={resolved?.status === "ready" ? commandText(resolved.steps) : undefined} outputType="git">
        <CommandOutput task={task} resolved={resolved} onSelectTask={open} />
      </OutputPanel>
    </>
  );
}

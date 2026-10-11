"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import Select from "@/components/ui/Select";
import TextInput from "@/components/ui/TextInput";
import { visibleFields } from "@/lib/command-builder/build";
import type { Catalog, Field as TaskField, FieldValue, FieldValues, Task } from "@/lib/command-builder/types";

interface TaskFormProps {
  catalog: Catalog;
  task: Task;
  values: FieldValues;
  errors: Record<string, string>;
  onChange: (id: string, value: FieldValue) => void;
  /** Replaces every value with a preset's. */
  onPreset: (presetId: string) => void;
  onBack: () => void;
  focusOnMount: boolean;
}

export default function TaskForm({ catalog, task, values, errors, onChange, onPreset, onBack, focusOnMount }: TaskFormProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Lands keyboard and screen reader users on the task they picked.
  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);

  const fields = visibleFields(task, values);

  return (
    <div className="space-y-5">
      <div>
        <Button size="sm" icon={ArrowLeft} onClick={onBack}>
          All tasks
        </Button>
        <h2 ref={heading} tabIndex={-1} className="mt-4 font-[family-name:var(--font-ui)] text-lg font-semibold focus:outline-none">
          {task.title}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">{task.summary}</p>
      </div>

      {task.presets && task.presets.length > 0 && (
        <div role="group" aria-labelledby={`${catalog.idPrefix}-presets`} className="space-y-2">
          <p id={`${catalog.idPrefix}-presets`} className="text-sm font-medium">
            Start from a preset
          </p>
          <div className="flex flex-wrap gap-2">
            {task.presets.map((p) => (
              <Button key={p.id} size="sm" onClick={() => onPreset(p.id)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {fields.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">Nothing to fill in: the command is ready.</p>
      ) : (
        fields.map((field) => (
          <FieldControl key={field.id} idPrefix={catalog.idPrefix} task={task} field={field} value={values[field.id]} error={errors[field.id]} onChange={onChange} />
        ))
      )}
    </div>
  );
}

interface FieldControlProps {
  idPrefix: string;
  task: Task;
  field: TaskField;
  value: FieldValue | undefined;
  error: string | undefined;
  onChange: (id: string, value: FieldValue) => void;
}

function FieldControl({ idPrefix, task, field, value, error, onChange }: FieldControlProps) {
  const id = `${idPrefix}-${task.id}-${field.id}`;
  const errorId = `${id}-error`;

  if (field.kind === "checkbox") {
    return (
      <Checkbox checked={value === true} onChange={(checked) => onChange(field.id, checked)}>
        {field.label}
      </Checkbox>
    );
  }

  const text = typeof value === "string" ? value : "";
  const label = (
    <>
      {field.label}
      {field.optional && <span className="font-normal text-[color:var(--text-muted)]"> (optional)</span>}
      {field.sensitive && (
        <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-xs font-normal text-[color:var(--text-muted)]">
          <Lock aria-hidden className="h-3 w-3" />
          not saved to history
        </span>
      )}
    </>
  );

  let control;
  if (field.kind === "select") {
    control = (
      <Select id={id} value={text} onChange={(e) => onChange(field.id, e.target.value)}>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  } else if (field.kind === "lines") {
    control = (
      <CodeTextArea
        id={id}
        value={text}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.id, e.target.value)}
        rows={Math.min(6, Math.max(2, text.split("\n").length))}
        invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
    );
  } else {
    const shared = {
      id,
      value: text,
      placeholder: field.placeholder,
      onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(field.id, e.target.value),
      "aria-describedby": error ? errorId : undefined,
    };
    control =
      field.kind === "prose" ? (
        <TextInput {...shared} aria-invalid={Boolean(error)} />
      ) : (
        <CodeInput {...shared} invalid={Boolean(error)} inputMode={field.kind === "number" ? "numeric" : undefined} />
      );
  }

  return (
    <Field label={label} htmlFor={id} help={field.help}>
      {control}
      {error && (
        <p id={errorId} className="text-xs text-[color:var(--error)]">
          {error}
        </p>
      )}
    </Field>
  );
}

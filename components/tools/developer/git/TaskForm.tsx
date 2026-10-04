"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import { ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import Select from "@/components/ui/Select";
import TextInput from "@/components/ui/TextInput";
import { visibleFields } from "@/lib/tools/developer/git/build";
import type { Field as TaskField, FieldValue, FieldValues, Task } from "@/lib/tools/developer/git/types";

interface TaskFormProps {
  task: Task;
  values: FieldValues;
  errors: Record<string, string>;
  onChange: (id: string, value: FieldValue) => void;
  onBack: () => void;
  focusOnMount: boolean;
}

export default function TaskForm({ task, values, errors, onChange, onBack, focusOnMount }: TaskFormProps) {
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

      {fields.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">Nothing to fill in: the command is ready.</p>
      ) : (
        fields.map((field) => (
          <FieldControl key={field.id} task={task} field={field} value={values[field.id]} error={errors[field.id]} onChange={onChange} />
        ))
      )}
    </div>
  );
}

interface FieldControlProps {
  task: Task;
  field: TaskField;
  value: FieldValue | undefined;
  error: string | undefined;
  onChange: (id: string, value: FieldValue) => void;
}

function FieldControl({ task, field, value, error, onChange }: FieldControlProps) {
  const id = `git-${task.id}-${field.id}`;
  const errorId = `${id}-error`;

  if (field.kind === "checkbox") {
    return (
      <Checkbox checked={value === true} onChange={(checked) => onChange(field.id, checked)}>
        {field.label}
      </Checkbox>
    );
  }

  const text = typeof value === "string" ? value : "";
  const label = field.optional ? (
    <>
      {field.label} <span className="font-normal text-[color:var(--text-muted)]">(optional)</span>
    </>
  ) : (
    field.label
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

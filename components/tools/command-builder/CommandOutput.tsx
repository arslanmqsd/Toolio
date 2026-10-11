"use client";

import { Fragment } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { CopyButton } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Section from "@/components/ui/Section";
import { placeholderToken, stepCommand, type FormatOptions, type Resolved } from "@/lib/command-builder/build";
import type { Catalog, Step, Task } from "@/lib/command-builder/types";
import { escapeEre } from "@/lib/tools/developer/git/quote";
import DangerBadge, { dangerTitles } from "./DangerBadge";

interface CommandOutputProps {
  catalog: Catalog;
  task: Task | null;
  resolved: Resolved | null;
  format?: FormatOptions;
  /** Whether every step that needs it has been confirmed. */
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  onSelectTask: (id: string) => void;
  /** Called when a step's command is copied. */
  onCopy?: () => void;
}

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

/** The steps that must be agreed to before their commands are shown. */
export const needsConfirm = (steps: Step[]) => steps.some((s) => s.confirm);

export default function CommandOutput({ catalog, task, resolved, format, confirmed, onConfirmedChange, onSelectTask, onCopy }: CommandOutputProps) {
  if (!task || !resolved) return <QuickStart catalog={catalog} onSelectTask={onSelectTask} />;

  if (resolved.status === "invalid") {
    return (
      <Alert title="Fix the highlighted fields">
        <ul className="list-disc pl-5">
          {task.fields
            .filter((f) => resolved.errors[f.id])
            .map((f) => (
              <li key={f.id}>
                {f.label}: {resolved.errors[f.id]}
              </li>
            ))}
        </ul>
      </Alert>
    );
  }

  const ready = resolved.status === "ready";
  const tokens = resolved.status === "incomplete" ? resolved.missing.map(placeholderToken) : [];
  const { steps } = resolved;
  const gated = needsConfirm(steps) && !confirmed;
  const shared = { tokens, format, hidden: gated, onSelectTask, onCopy };

  return (
    <div className="space-y-6 font-[family-name:var(--font-ui)]">
      {resolved.status === "incomplete" && (
        <p className="text-sm text-[color:var(--text-muted)]">
          Fill in {listFormat.format(resolved.missing.map((f) => f.label.toLowerCase()))} to copy the command.
        </p>
      )}

      {needsConfirm(steps) && (
        <div className="rounded-md border border-[color:color-mix(in_srgb,var(--error)_40%,transparent)] p-3">
          <Checkbox checked={confirmed} onChange={onConfirmedChange}>
            <span className="text-[color:var(--text)]">{steps.find((s) => s.confirm)?.confirm}</span>
          </Checkbox>
        </div>
      )}

      {steps.length === 1 ? (
        <StepView step={steps[0]} copyable={false} {...shared} />
      ) : (
        <ol className="space-y-8">
          {steps.map((s, i) => (
            <li key={i}>
              <StepView step={s} number={i + 1} copyable={ready && !gated} {...shared} />
            </li>
          ))}
        </ol>
      )}

      {task.related && task.related.length > 0 && (
        <Section label="Related">
          <div className="flex flex-wrap gap-2">
            {task.related.map((id) => (
              <Button key={id} size="sm" onClick={() => onSelectTask(id)}>
                {catalog.getTask(id)?.title}
              </Button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

interface StepViewProps {
  step: Step;
  /** Set for multi-step tasks: shows a numbered header with the step's own copy button. */
  number?: number;
  copyable: boolean;
  tokens: string[];
  format?: FormatOptions;
  /** The command stays hidden until a confirmation is ticked. */
  hidden: boolean;
  onSelectTask: (id: string) => void;
  onCopy?: () => void;
}

function StepView({ step, number, copyable, tokens, format, hidden, onSelectTask, onCopy }: StepViewProps) {
  const command = stepCommand(step, format);
  const alternative = step.saferAlternative;

  return (
    <div className="space-y-3">
      {number !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium text-[color:var(--accent-text)]">Step {number}</h3>
          <div className="flex items-center gap-2">
            <DangerBadge danger={step.danger} />
            <CopyButton text={copyable ? command : undefined} onCopied={onCopy} />
          </div>
        </div>
      )}

      {step.danger !== "safe" && step.warning && (
        <Alert
          tone={step.danger === "destructive" ? "error" : "warn"}
          title={
            <span className="inline-flex items-center gap-1.5">
              <TriangleAlert aria-hidden className="h-4 w-4" />
              {dangerTitles[step.danger]}
            </span>
          }
        >
          <p>{step.warning}</p>
          {alternative && (
            <Button size="sm" className="mt-3" onClick={() => onSelectTask(alternative.taskId)}>
              {alternative.label}
            </Button>
          )}
        </Alert>
      )}

      {hidden ? (
        <p className="rounded-md border border-dashed border-[color:var(--border)] p-3 text-sm text-[color:var(--text-muted)]">
          Tick the box above to show this command.
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words rounded-md border border-[color:var(--border)] p-3 font-[family-name:var(--font-mono)] text-sm">
            <CommandText text={command} tokens={tokens} />
          </p>

          {/* Stacked on phones; side by side from sm, with long parts (like the cleanup pipe) capped so explanations keep room. */}
          <dl className="grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-[fit-content(45%)_1fr] sm:gap-y-1.5">
            {step.parts.map((p, i) => (
              <Fragment key={i}>
                <dt className="break-all font-[family-name:var(--font-mono)]">
                  <CommandText text={p.text} tokens={tokens} />
                </dt>
                <dd className="mb-2 text-[color:var(--text-muted)] sm:mb-0">{p.explain}</dd>
              </Fragment>
            ))}
          </dl>
        </>
      )}

      {step.notes && step.notes.length > 0 && (
        <ul className="space-y-1.5 text-xs text-[color:var(--text-muted)]">
          {step.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Command text with the <placeholder> tokens of still-empty fields muted. */
function CommandText({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return <>{text}</>;
  const pieces = text.split(new RegExp(`(${tokens.map(escapeEre).join("|")})`));
  return (
    <>
      {pieces.map((piece, i) =>
        tokens.includes(piece) ? (
          <span key={i} className="italic text-[color:var(--text-muted)]">
            {piece}
          </span>
        ) : (
          <Fragment key={i}>{piece}</Fragment>
        ),
      )}
    </>
  );
}

function QuickStart({ catalog, onSelectTask }: { catalog: Catalog; onSelectTask: (id: string) => void }) {
  return (
    <div className="space-y-4 font-[family-name:var(--font-ui)]">
      <p className="text-[color:var(--text-muted)]">Pick a task to see its command, with every part explained.</p>
      <Section label="Popular">
        <div className="flex flex-wrap gap-2">
          {catalog.quickStart.map((id) => (
            <Button key={id} size="sm" onClick={() => onSelectTask(id)}>
              {catalog.getTask(id)?.title}
            </Button>
          ))}
        </div>
      </Section>
    </div>
  );
}

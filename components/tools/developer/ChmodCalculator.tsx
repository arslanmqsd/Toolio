"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { CopyButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput } from "@/components/ui/CodeField";
import CodeBlock from "@/components/ui/CodeBlock";
import Field from "@/components/ui/Field";
import LabelledControl from "@/components/ui/LabelledControl";
import Section from "@/components/ui/Section";
import SegmentedControl from "@/components/ui/SegmentedControl";
import ValueTable from "@/components/ui/ValueTable";
import {
  CLASSES,
  PERMISSIONS,
  SETGID,
  SETUID,
  STICKY,
  chmodCommand,
  defaultFileMode,
  describeMode,
  formatOctal,
  formatSymbolic,
  getWarnings,
  parseOctal,
  parseSymbolic,
  parseUmask,
  recursiveCommands,
  umaskDefaults,
  type Target,
} from "@/lib/tools/developer/chmod";

const INITIAL_MODE = 0o755;

const PRESETS = [
  { mode: 0o644, use: "Files" },
  { mode: 0o755, use: "Programs, folders" },
  { mode: 0o600, use: "Private files" },
  { mode: 0o700, use: "Private folders" },
  { mode: 0o664, use: "Team files" },
  { mode: 0o775, use: "Team folders" },
  { mode: 0o400, use: "SSH keys" },
  { mode: 0o1777, use: "Shared, like /tmp" },
  { mode: 0o777, use: "Anyone (risky)" },
];

const SPECIALS = [
  { bit: SETUID, label: "Setuid", help: { file: "runs as its owner", directory: "ignored on Linux" } },
  { bit: SETGID, label: "Setgid", help: { file: "runs as its group", directory: "new files get its group" } },
  { bit: STICKY, label: "Sticky", help: { file: "no effect on files", directory: "only owners delete files" } },
] as const;

const TARGETS = [
  { id: "file", label: "File" },
  { id: "directory", label: "Directory" },
] as const;

const muted = "font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]";

/** A field's error under it; the field points at it with aria-describedby. */
function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs text-[color:var(--error)]">
      {children}
    </p>
  );
}

/**
 * Text that edits a mode: shows the mode while it's valid and keeps what was typed while it isn't,
 * so a half-typed or wrong value never clears the rest of the tool.
 */
function useModeText(mode: number, format: (mode: number) => string) {
  const [draft, setDraft] = useState<string | null>(null);
  return { value: draft ?? format(mode), draft, setDraft };
}

export default function ChmodCalculator() {
  const [mode, setMode] = useState(INITIAL_MODE);
  const [target, setTarget] = useState<Target>("file");
  const [path, setPath] = useState("");
  const [recursive, setRecursive] = useState(false);
  const [fileModeDraft, setFileModeDraft] = useState<string | null>(null);
  const [umaskText, setUmaskText] = useState("022");
  const octal = useModeText(mode, formatOctal);
  const symbolic = useModeText(mode, formatSymbolic);

  const octalResult = octal.draft === null ? null : parseOctal(octal.draft);
  const symbolicResult = symbolic.draft === null ? null : parseSymbolic(symbolic.draft);

  function changeMode(next: number) {
    setMode(next);
    octal.setDraft(null);
    symbolic.setDraft(null);
  }

  function editOctal(text: string) {
    octal.setDraft(text);
    const r = parseOctal(text);
    if (r.ok) {
      setMode(r.mode);
      symbolic.setDraft(null);
    }
  }

  function editSymbolic(text: string) {
    symbolic.setDraft(text);
    const r = parseSymbolic(text);
    if (r.ok) {
      setMode(r.mode);
      octal.setDraft(null);
    }
  }

  function clear() {
    changeMode(INITIAL_MODE);
    setTarget("file");
    setPath("");
    setRecursive(false);
    setFileModeDraft(null);
  }

  const isRecursive = target === "directory" && recursive;
  const fileModeResult = fileModeDraft === null ? ({ ok: true, mode: defaultFileMode(mode) } as const) : parseOctal(fileModeDraft);
  const shownPath = path.trim() === "" ? (target === "file" ? "file" : "folder") : path;
  const commands = isRecursive && fileModeResult.ok ? recursiveCommands(mode, fileModeResult.mode, shownPath) : null;
  const command = isRecursive ? commands?.find : chmodCommand(mode, shownPath);

  const warnings = [
    ...getWarnings(mode, target),
    ...(isRecursive && fileModeResult.ok ? getWarnings(fileModeResult.mode, "file").map((w) => ({ ...w, id: `file-${w.id}`, title: `Files: ${w.title}` })) : []),
  ];

  const umask = parseUmask(umaskText);
  const umaskModes = umask.ok ? umaskDefaults(umask.mode) : null;

  return (
    <>
      <InputPanel label="Permissions">
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Presets</legend>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.mode}
                  size="sm"
                  aria-pressed={mode === preset.mode}
                  onClick={() => changeMode(preset.mode)}
                  className={`flex-col !gap-0 ${mode === preset.mode ? "!border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]" : ""}`}
                >
                  <span className="font-[family-name:var(--font-mono)]">{formatOctal(preset.mode)}</span>
                  <span className="text-xs text-[color:var(--text-muted)]">{preset.use}</span>
                </Button>
              ))}
            </div>
          </fieldset>

          <table className="w-full max-w-sm text-sm">
            <caption className="sr-only">Permissions for owner, group and others</caption>
            <thead>
              <tr>
                <td />
                {PERMISSIONS.map((p) => (
                  <th key={p.id} scope="col" className="pb-1 font-medium">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CLASSES.map((c) => (
                <tr key={c.id} className="border-t border-[color:var(--border)]">
                  <th scope="row" className="py-1 pr-3 text-left font-medium">
                    {c.label}
                  </th>
                  {PERMISSIONS.map((p) => {
                    const bit = p.bit << c.shift;
                    return (
                      <td key={p.id} className="text-center">
                        <label className="flex cursor-pointer justify-center py-2">
                          <input
                            type="checkbox"
                            checked={(mode & bit) !== 0}
                            onChange={(e) => changeMode(e.target.checked ? mode | bit : mode & ~bit)}
                            aria-label={`${c.label} ${p.label.toLowerCase()}`}
                            className="h-4 w-4 accent-[color:var(--accent)]"
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Special bits</legend>
            {SPECIALS.map((s) => (
              <Checkbox key={s.bit} checked={(mode & s.bit) !== 0} onChange={(on) => changeMode(on ? mode | s.bit : mode & ~s.bit)}>
                <span>
                  <span className="text-[color:var(--text)]">{s.label}</span>: {s.help[target]}
                </span>
              </Checkbox>
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Octal" htmlFor="chmod-octal">
              <CodeInput
                id="chmod-octal"
                inputMode="numeric"
                value={octal.value}
                onChange={(e) => editOctal(e.target.value)}
                onBlur={() => octalResult?.ok && octal.setDraft(null)}
                invalid={octalResult?.ok === false}
                aria-describedby={octalResult?.ok === false ? "chmod-octal-error" : undefined}
              />
              {octalResult?.ok === false && <FieldError id="chmod-octal-error">{octalResult.error}</FieldError>}
            </Field>
            <Field label="Symbolic" htmlFor="chmod-symbolic">
              <CodeInput
                id="chmod-symbolic"
                value={symbolic.value}
                onChange={(e) => editSymbolic(e.target.value)}
                onBlur={() => symbolicResult?.ok && symbolic.setDraft(null)}
                invalid={symbolicResult?.ok === false}
                aria-describedby={symbolicResult?.ok === false ? "chmod-symbolic-error" : "chmod-symbolic-help"}
              />
              {symbolicResult?.ok === false ? (
                <FieldError id="chmod-symbolic-error">{symbolicResult.error}</FieldError>
              ) : (
                <p id="chmod-symbolic-help" className="text-xs text-[color:var(--text-muted)]">
                  Or paste from ls -l, like drwxr-xr-x.
                </p>
              )}
            </Field>
          </div>

          <LabelledControl label="Applies to">
            <SegmentedControl label="Applies to" options={TARGETS} value={target} onChange={setTarget} />
          </LabelledControl>

          <Field label="Path" htmlFor="chmod-path" help="Only used to build the command. Quoted for the shell if needed.">
            <CodeInput id="chmod-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder={target === "file" ? "file" : "folder"} />
          </Field>

          {target === "directory" && (
            <div className="space-y-3">
              <Checkbox checked={recursive} onChange={setRecursive}>
                Everything inside too (recursive)
              </Checkbox>
              {recursive && (
                <Field
                  label="Mode for files inside"
                  htmlFor="chmod-file-mode"
                  help="Directories inside get the mode above. Files usually get the same without execute."
                  action={
                    fileModeDraft !== null && (
                      <button type="button" className="text-xs text-[color:var(--accent-text)] underline" onClick={() => setFileModeDraft(null)}>
                        Reset to {formatOctal(defaultFileMode(mode))}
                      </button>
                    )
                  }
                >
                  <CodeInput
                    id="chmod-file-mode"
                    inputMode="numeric"
                    value={fileModeDraft ?? formatOctal(defaultFileMode(mode))}
                    onChange={(e) => setFileModeDraft(e.target.value)}
                    invalid={!fileModeResult.ok}
                    aria-describedby={!fileModeResult.ok ? "chmod-file-mode-error" : undefined}
                    className="sm:max-w-32"
                  />
                  {!fileModeResult.ok && <FieldError id="chmod-file-mode-error">{fileModeResult.error}</FieldError>}
                </Field>
              )}
            </div>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Default permissions from a umask</summary>
            <div className="mt-3 space-y-3">
              <Field label="umask" htmlFor="chmod-umask" help="Run umask in a terminal to see yours. New files never get execute from it.">
                <CodeInput
                  id="chmod-umask"
                  inputMode="numeric"
                  value={umaskText}
                  onChange={(e) => setUmaskText(e.target.value)}
                  invalid={!umask.ok}
                  aria-describedby={!umask.ok ? "chmod-umask-error" : undefined}
                  className="sm:max-w-32"
                />
                {!umask.ok && <FieldError id="chmod-umask-error">{umask.error}</FieldError>}
              </Field>
              {umaskModes && (
                <ValueTable
                  rows={[
                    { label: "New files", value: formatOctal(umaskModes.file), note: formatSymbolic(umaskModes.file) },
                    { label: "New directories", value: formatOctal(umaskModes.directory), note: formatSymbolic(umaskModes.directory) },
                  ]}
                />
              )}
            </div>
          </details>

          <div className="flex justify-end">
            <Button size="sm" icon={X} onClick={clear}>
              Clear
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label="Result" copyText={command} outputType="code">
        <div className="space-y-5">
          <ValueTable
            rows={[
              { label: "Octal", value: formatOctal(mode) },
              { label: "Symbolic", value: formatSymbolic(mode) },
              { label: "ls -l", value: (target === "file" ? "-" : "d") + formatSymbolic(mode) },
            ]}
          />

          <Section label="What it means">
            <div className="space-y-1 font-[family-name:var(--font-ui)]" aria-live="polite">
              {describeMode(mode, target).map((sentence) => (
                <p key={sentence}>{sentence}</p>
              ))}
            </div>
          </Section>

          {warnings.map((w) => (
            <Alert key={w.id} tone="warn" title={w.title}>
              {w.detail}
            </Alert>
          ))}

          {isRecursive ? (
            commands ? (
              <RecursiveSection commands={commands} />
            ) : (
              <p className={muted}>Fix the mode for files inside to see the commands.</p>
            )
          ) : (
            <Section label="Command">
              <CodeBlock code={command ?? ""} wrap />
              {target === "directory" && mode <= 0o777 && (
                <p className={`mt-2 ${muted}`}>
                  On Linux this keeps the directory&apos;s setgid bit if it has one. To clear it too, use {formatOctal(mode).padStart(5, "0")} or chmod g-s.
                </p>
              )}
            </Section>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

function CommandBlock({ label, code, what, note }: { label: string; code: string; what: string; note?: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h3 className={muted}>{label}</h3>
        <span className="text-xs text-[color:var(--text-muted)]">
          <CopyButton text={code} what={what} />
        </span>
      </div>
      <CodeBlock code={code} wrap />
      {note && <p className={`mt-1 ${muted}`}>{note}</p>}
    </div>
  );
}

function RecursiveSection({ commands }: { commands: ReturnType<typeof recursiveCommands> }) {
  return (
    <Section label="Commands">
      <div className="space-y-4">
        <CommandBlock label="Directories and files separately" code={commands.find} what="find commands" />
        {commands.capitalX && (
          <CommandBlock
            label="Or in one command"
            code={commands.capitalX}
            what="chmod -R command with X"
            note="X sets execute on directories, and keeps it on files that already have it, like scripts."
          />
        )}
        <CommandBlock
          label="Same mode for everything"
          code={commands.plain}
          what="plain chmod -R command"
          note="Gives files the directory mode too, so every file becomes executable. Usually not what you want."
        />
      </div>
    </Section>
  );
}

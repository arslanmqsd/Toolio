"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import CodeBlock from "@/components/ui/CodeBlock";
import SearchInput from "@/components/ui/SearchInput";
import { DEFAULT_PRESET, STACK_PRESETS, TEMPLATE_CATEGORIES, TEMPLATES } from "@/lib/tools/developer/gitignore-data/manifest";
import { filterTemplates, mergeGitignore, orderTemplateIds, templatesFromText } from "@/lib/tools/developer/gitignore-generator";

const labels = new Map(TEMPLATES.map((t) => [t.id, t.label]));

export default function GitignoreGenerator() {
  // The selection lives in the tool's main input as "node, vscode, macos", so a saved snippet, sent
  // text or a pasted list of names can fill it.
  const [nothingFound, setNothingFound] = useState(false);
  const [value, setValue] = useToolInput(DEFAULT_PRESET.templates.join(", "), (next) =>
    setNothingFound(templatesFromText(next).length === 0),
  );
  const selected = useMemo(() => templatesFromText(value), [value]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const { text, duplicates } = useMemo(() => mergeGitignore(selected), [selected]);
  const matches = useMemo(() => new Set(filterTemplates(query).map((t) => t.id)), [query]);
  const groups = TEMPLATE_CATEGORIES.map((c) => ({ ...c, templates: TEMPLATES.filter((t) => t.category === c.id && matches.has(t.id)) })).filter(
    (g) => g.templates.length > 0,
  );

  function select(ids: string[]) {
    setNothingFound(false);
    setValue(orderTemplateIds(ids).join(", "));
  }

  function toggle(id: string, on: boolean) {
    select(on ? [...selected, id] : selected.filter((s) => s !== id));
  }

  // After a chip's remove button goes, focus the chip that took its place so keyboard users keep their spot.
  const chipButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusChip, setFocusChip] = useState<number | null>(null);
  useEffect(() => {
    if (focusChip === null) return;
    const target = chipButtons.current[Math.min(focusChip, selected.length - 1)];
    (target ?? searchRef.current)?.focus();
    setFocusChip(null);
  }, [focusChip, selected.length]);

  return (
    <>
      <InputPanel label="Templates">
        <div className="space-y-5">
          <div role="group" aria-label="Stacks" className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[color:var(--text-muted)]">Stacks:</span>
            {STACK_PRESETS.map((preset) => {
              const active = sameIds(selected, orderTemplateIds(preset.templates));
              return (
                <Button
                  key={preset.id}
                  size="sm"
                  aria-pressed={active}
                  onClick={() => select(preset.templates)}
                  className={active ? "border-[color:var(--accent)] text-[color:var(--accent)]" : ""}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>

          {nothingFound && (
            <Alert tone="warn" title="No template names found">
              The text sent here didn&apos;t name any templates. Pick them below instead.
            </Alert>
          )}

          <SearchInput ref={searchRef} label="Search templates" placeholder="Search, e.g. python, pycharm, unity" value={query} onChange={setQuery} />

          {groups.length === 0 ? (
            <p className="text-sm text-[color:var(--text-muted)]">No template matches “{query.trim()}”.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const count = group.templates.filter((t) => selected.includes(t.id)).length;
                return (
                  <fieldset key={group.id}>
                    <legend className="mb-2 text-sm font-medium">
                      {group.label}
                      {count > 0 && <span className="ml-2 text-xs font-normal text-[color:var(--text-muted)]">{count} selected</span>}
                    </legend>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                      {group.templates.map((t) => (
                        <Checkbox key={t.id} checked={selected.includes(t.id)} onChange={(on) => toggle(t.id, on)}>
                          {t.label}
                          {t.note && <span className="text-xs">({t.note})</span>}
                        </Checkbox>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}

          <p className="text-xs text-[color:var(--text-muted)]">
            Templates from GitHub&apos;s github/gitignore collection, bundled with this page, so nothing is fetched.
          </p>
        </div>
      </InputPanel>

      <OutputPanel label=".gitignore" copyText={text || undefined} outputType="gitignore" download={{ filename: ".gitignore", mimeType: "text/plain" }}>
        <div className="mb-4 flex flex-wrap items-start gap-2 font-[family-name:var(--font-ui)]">
          {selected.length > 0 && (
            <ul aria-label="Selected templates" className="flex flex-1 flex-wrap gap-2">
              {selected.map((id, i) => (
                <li key={id} className="flex items-center gap-1 rounded-full border border-[color:var(--border)] py-0.5 pl-3 pr-1 text-sm">
                  {labels.get(id)}
                  <button
                    ref={(el) => {
                      chipButtons.current[i] = el;
                    }}
                    type="button"
                    aria-label={`Remove ${labels.get(id)}`}
                    onClick={() => {
                      toggle(id, false);
                      setFocusChip(i);
                    }}
                    className="rounded-full p-0.5 text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" icon={X} onClick={() => select([])} disabled={selected.length === 0} className="ml-auto">
            Clear
          </Button>
        </div>
        {duplicates > 0 && (
          <p className="mb-3 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
            Left out {duplicates === 1 ? "1 line" : `${duplicates} lines`} that an earlier template already has.
          </p>
        )}
        {text ? (
          <CodeBlock code={text} />
        ) : (
          <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">Pick a stack or some templates to build your .gitignore.</p>
        )}
      </OutputPanel>
    </>
  );
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

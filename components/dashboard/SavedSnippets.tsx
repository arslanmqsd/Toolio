"use client";

import Link from "next/link";
import { useState } from "react";
import { IconTile } from "@/components/catalog/icons";
import Button, { buttonClass } from "@/components/ui/Button";
import FormError from "@/components/ui/FormError";
import { detectType } from "@/components/workbench/detectors";
import { useWorkbench } from "@/components/workbench/context";
import { oneLinePreview } from "@/lib/one-line-preview";
import { useSync, useSyncedData, type Snippet } from "@/lib/sync";
import { getToolById, toolHref, type ToolConfig } from "@/registry";
import DashboardSection, { SectionNote } from "./DashboardSection";

const PREVIEW_LENGTH = 90;

/** Snippets grouped by tool, tools in the order of their newest snippet. */
function groupByTool(snippets: Snippet[]): { tool: ToolConfig; snippets: Snippet[] }[] {
  const groups = new Map<string, { tool: ToolConfig; snippets: Snippet[] }>();
  for (const snippet of snippets) {
    const tool = getToolById(snippet.toolId);
    if (!tool) continue;
    const group = groups.get(tool.id) ?? { tool, snippets: [] };
    group.snippets.push(snippet);
    groups.set(tool.id, group);
  }
  return Array.from(groups.values());
}

export default function SavedSnippets() {
  const [snippets, setSnippets] = useSyncedData("snippets");
  const { deleteSnippet } = useSync();
  const { setWorkbench } = useWorkbench();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function remove(snippet: Snippet) {
    const before = snippets ?? [];
    setConfirming(null);
    setFailed(null);
    setSnippets(before.filter((s) => s.id !== snippet.id));
    try {
      await deleteSnippet(snippet.id);
    } catch {
      setSnippets(before);
      setFailed(snippet.id);
    }
  }

  const groups = groupByTool(snippets ?? []);

  return (
    <DashboardSection
      id="snippets"
      title="Saved snippets"
      description="Inputs you saved with “Save this input” on a tool. Load one to open the tool with it filled in."
    >
      {snippets === null ? (
        <SectionNote>Loading snippets…</SectionNote>
      ) : groups.length === 0 ? (
        <SectionNote>No snippets yet. On any tool, use “Save this input” above the input.</SectionNote>
      ) : (
        <div className="space-y-6">
          {groups.map(({ tool, snippets: toolSnippets }) => (
            <section key={tool.id} aria-labelledby={`snippets-${tool.id}`}>
              <h3 id={`snippets-${tool.id}`} className="mb-2 flex items-center gap-2 text-sm font-medium">
                <IconTile category={tool.category} toolId={tool.id} size="sm" />
                {tool.title}
              </h3>
              <ul className="divide-y divide-[color:var(--border)] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-raised)]">
                {toolSnippets.map((snippet) => (
                  <li key={snippet.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="truncate text-sm font-medium">{snippet.label}</p>
                      <code className="block truncate font-[family-name:var(--font-mono)] text-xs text-[color:var(--text-muted)]">
                        {oneLinePreview(snippet.value, PREVIEW_LENGTH)}
                      </code>
                      {failed === snippet.id && (
                        <div className="mt-2">
                          <FormError id={`snippet-error-${snippet.id}`}>
                            Couldn&apos;t delete it. Check your connection and try again.
                          </FormError>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {confirming === snippet.id ? (
                        <>
                          <span className="text-sm text-[color:var(--text-muted)]">Delete?</span>
                          <Button size="sm" onClick={() => remove(snippet)} aria-label={`Delete “${snippet.label}” for good`}>
                            Delete
                          </Button>
                          {/* Focus lands on the safe choice when the confirm replaces the Delete button. */}
                          <Button size="sm" autoFocus onClick={() => setConfirming(null)}>
                            Keep
                          </Button>
                        </>
                      ) : (
                        <>
                          <Link
                            href={toolHref(tool)}
                            onClick={() =>
                              setWorkbench({
                                type: detectType(snippet.value),
                                value: snippet.value,
                                origin: { kind: "snippet", label: snippet.label, to: tool.id },
                              })
                            }
                            aria-label={`Load “${snippet.label}” into ${tool.title}`}
                            className={buttonClass({ variant: "primary", size: "sm" })}
                          >
                            Load
                          </Link>
                          <Button size="sm" onClick={() => setConfirming(snippet.id)} aria-label={`Delete “${snippet.label}”`}>
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </DashboardSection>
  );
}

"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import { CodeTextArea } from "@/components/ui/CodeField";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { filePath, languagePath, MAX_GIT_DIFF_BYTES, parseGitDiff } from "@/lib/tools/developer/git-diff/git-parse";
import { GIT_DIFF_SAMPLE } from "@/lib/tools/developer/git-diff/git-sample";
import { highlightHunks, HIGHLIGHT_LINE_LIMIT, type SideHighlights } from "@/lib/diff/highlight";
import { languageForFile, type LanguageId } from "@/lib/diff/language";
import type { DiffFile, FileStatus, Stats } from "@/lib/diff/model";
import { readTextFile } from "@/lib/files/text-file";
import DiffStats from "@/components/diff/DiffStats";
import DiffView, { SPLIT_QUERY, type DiffLayout } from "@/components/diff/DiffView";
import { useHighlighters } from "@/components/diff/useHighlighters";

/** Files longer than this start collapsed, so one huge file doesn't bury the rest. */
const COLLAPSE_ROWS = 500;

const VIEWS = [
  { id: "unified", label: "Unified" },
  { id: "split", label: "Split" },
] as const;

const STATUS: Record<FileStatus, { letter: string; label: string; tone: string }> = {
  modified: { letter: "M", label: "Modified", tone: "text-[color:var(--accent-warn-text)]" },
  added: { letter: "A", label: "Added", tone: "text-[color:var(--diff-add-text)]" },
  deleted: { letter: "D", label: "Deleted", tone: "text-[color:var(--diff-remove-text)]" },
  renamed: { letter: "R", label: "Renamed", tone: "text-[color:var(--accent-text)]" },
  copied: { letter: "C", label: "Copied", tone: "text-[color:var(--accent-text)]" },
  mode: { letter: "M", label: "Mode changed", tone: "text-[color:var(--text-muted)]" },
};

const HINT = "Paste the output of git diff, git show, or a .patch file.";

const rowCount = (file: DiffFile) => file.hunks.reduce((n, hunk) => n + hunk.rows.length, 0);

export default function GitDiffViewer() {
  const [text, setText] = useToolInput(GIT_DIFF_SAMPLE);
  const [fileError, setFileError] = useState<string>();
  const [view, setView] = useState<DiffLayout>("unified");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const canSplit = useMediaQuery(SPLIT_QUERY);
  const idPrefix = useId();

  const deferred = useDeferredValue(text);
  const result = useMemo(() => (deferred.trim() ? parseGitDiff(deferred) : null), [deferred]);
  const files = useMemo(() => (result?.ok ? result.files : []), [result]);

  const languages = useMemo(
    () => files.map((f) => languageForFile(languagePath(f))).filter((l): l is LanguageId => l !== null),
    [files],
  );
  const highlighterFor = useHighlighters(languages);
  const highlights = useMemo((): (SideHighlights | null)[] => {
    const tooLong = files.reduce((n, f) => n + rowCount(f), 0) > HIGHLIGHT_LINE_LIMIT;
    return files.map((f) => {
      const highlight = tooLong ? null : highlighterFor(languageForFile(languagePath(f)));
      return highlight ? highlightHunks(f.hunks, highlight) : null;
    });
  }, [files, highlighterFor]);

  const totals = files.reduce<Stats>(
    (sum, f) => ({
      added: sum.added + f.stats.added,
      removed: sum.removed + f.stats.removed,
      unchanged: sum.unchanged + f.stats.unchanged,
    }),
    { added: 0, removed: 0, unchanged: 0 },
  );

  const keyOf = (file: DiffFile, i: number) => `${i}:${filePath(file)}`;
  const headingId = (i: number) => `${idPrefix}-file-${i}`;
  const isOpen = (file: DiffFile, i: number) => open[keyOf(file, i)] ?? rowCount(file) <= COLLAPSE_ROWS;
  const setFileOpen = (file: DiffFile, i: number, value: boolean) => setOpen((o) => ({ ...o, [keyOf(file, i)]: value }));

  function jumpTo(file: DiffFile, i: number) {
    setFileOpen(file, i, true);
    const heading = document.getElementById(headingId(i));
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }

  async function loadFile(file: File) {
    const read = await readTextFile(file, MAX_GIT_DIFF_BYTES);
    if (!read.ok) {
      setFileError(read.error);
      return;
    }
    setFileError(undefined);
    setText(read.text);
  }

  function body() {
    if (!result) return <p className="text-[color:var(--text-muted)]">{HINT}</p>;
    if (!result.ok) {
      if (result.reason === "combined") {
        return (
          <Alert tone="warn" title="Combined diffs aren't supported yet">
            Merge commits shown as a combined diff (diff --cc) can&apos;t be displayed yet. Compare against one parent
            instead, e.g. git diff &lt;commit&gt;^1 &lt;commit&gt;.
          </Alert>
        );
      }
      if (result.reason === "too-large") return <Alert title="This diff is too large">Diffs over 5 MB can&apos;t be shown.</Alert>;
      return <Alert title="No diff found">{HINT}</Alert>;
    }

    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DiffStats stats={totals} files={files.length} />
          {canSplit && <SegmentedControl label="View" options={VIEWS} value={view} onChange={setView} />}
        </div>

        <nav aria-label="Files">
          <ul className="divide-y divide-[color:var(--border)] rounded-md border border-[color:var(--border)]">
            {files.map((file, i) => (
              <li key={keyOf(file, i)}>
                <a
                  href={`#${headingId(i)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    jumpTo(file, i);
                  }}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[color:var(--surface-raised)]"
                >
                  <StatusBadge status={file.status} />
                  <span className="min-w-0 flex-1 break-all font-[family-name:var(--font-mono)]">{filePath(file)}</span>
                  <FileCounts file={file} />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {files.map((file, i) => {
          const expanded = isOpen(file, i);
          return (
            <section
              key={keyOf(file, i)}
              aria-labelledby={headingId(i)}
              className="rounded-md border border-[color:var(--border)]"
            >
              <h3
                id={headingId(i)}
                tabIndex={-1}
                className="scroll-mt-20 rounded-md focus:outline focus:outline-1 focus:outline-[color:var(--accent)]"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setFileOpen(file, i, !expanded)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
                >
                  <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  <StatusBadge status={file.status} />
                  <span className="min-w-0 flex-1 break-all font-[family-name:var(--font-mono)]">{filePath(file)}</span>
                  <FileCounts file={file} />
                </button>
              </h3>
              {expanded && (
                <div className="border-t border-[color:var(--border)]">
                  {file.binary ? (
                    <p className="p-3 text-sm text-[color:var(--text-muted)]">Binary file, so there are no lines to show.</p>
                  ) : file.hunks.length === 0 ? (
                    <p className="p-3 text-sm text-[color:var(--text-muted)]">
                      {file.status === "mode" ? "Only the file's permissions changed." : "No line changes."}
                    </p>
                  ) : (
                    <DiffView hunks={file.hunks} layout={canSplit ? view : "unified"} context="none" highlights={highlights[i]} />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </>
    );
  }

  return (
    <>
      <InputPanel label="Git diff" wide>
        <div className="space-y-2">
          <CodeTextArea
            aria-label="Git diff"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={HINT}
            aria-describedby={fileError ? "git-diff-file-error" : undefined}
          />
          <FileDrop compact onFiles={([file]) => loadFile(file)} what="a .diff or .patch file" />
          {fileError && (
            <p id="git-diff-file-error" role="alert" className="text-xs text-[color:var(--error)]">
              {fileError}
            </p>
          )}
        </div>
      </InputPanel>

      <OutputPanel label="Changes" wide>
        <div className="space-y-4 font-[family-name:var(--font-ui)]">{body()}</div>
      </OutputPanel>
    </>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  const { letter, label, tone } = STATUS[status];
  return (
    <span title={label} className={`w-4 shrink-0 text-center font-[family-name:var(--font-mono)] font-semibold ${tone}`}>
      <span aria-hidden>{letter}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function FileCounts({ file }: { file: DiffFile }) {
  if (file.binary) return <span className="shrink-0 text-xs text-[color:var(--text-muted)]">binary</span>;
  return (
    <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs">
      <span className="sr-only">
        {file.stats.added} added, {file.stats.removed} removed
      </span>
      <span aria-hidden className="text-[color:var(--diff-add-text)]">
        +{file.stats.added}
      </span>{" "}
      <span aria-hidden className="text-[color:var(--diff-remove-text)]">
        −{file.stats.removed}
      </span>
    </span>
  );
}

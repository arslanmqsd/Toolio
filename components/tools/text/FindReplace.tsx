"use client";

import { useMemo, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import { useWorkerJob } from "@/lib/hooks/useWorkerJob";
import { plural } from "@/lib/notices";
import { buildFindRegex, type FindReplaceRequest, type FindReplaceResult } from "@/lib/tools/text/find-replace";

const EXAMPLE = "Meeting on 2026-10-25 with Sam.\nFollow-up on 2026-11-02 with Sam and Alex.";

const TIMEOUT_MS = 1000;
const DEBOUNCE_MS = 120;

function createWorker() {
  return new Worker(new URL("../../../lib/tools/text/find-replace.worker.ts", import.meta.url));
}

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

export default function FindReplace() {
  const [text, setText] = useToolInput(EXAMPLE);
  const [find, setFind] = useState("Sam");
  const [replace, setReplace] = useState("Jordan");
  const [regex, setRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(true);

  const syntaxError = useMemo(() => {
    if (!regex || !find) return null;
    try {
      buildFindRegex({ find, regex, matchCase, wholeWord });
      return null;
    } catch (err) {
      return (err as Error).message.replace(/^Invalid regular expression: /, "");
    }
  }, [find, regex, matchCase, wholeWord]);

  const request = useMemo<FindReplaceRequest | null>(
    () => (find && syntaxError === null ? { text, find, replace, regex, matchCase, wholeWord } : null),
    [text, find, replace, regex, matchCase, wholeWord, syntaxError],
  );
  const state = useWorkerJob<FindReplaceRequest, FindReplaceResult>(createWorker, request, { timeoutMs: TIMEOUT_MS, debounceMs: DEBOUNCE_MS });

  // With nothing to find, the text passes through unchanged.
  const result = !find ? { output: text, count: 0 } : state.status === "done" && !syntaxError ? state.result : null;

  return (
    <>
      <InputPanel label="Text">
        <div className="space-y-5">
          <CodeTextArea aria-label="Text to search" value={text} onChange={(e) => setText(e.target.value)} rows={10} />

          <Field label="Find" htmlFor="find">
            <CodeInput
              id="find"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              invalid={syntaxError !== null}
              aria-describedby={syntaxError ? "find-error" : undefined}
            />
          </Field>

          <Field
            label="Replace with"
            htmlFor="replace"
            help={regex ? "Use $1 or $<name> for groups, $& for the whole match, \\n for a new line." : undefined}
          >
            <CodeInput id="replace" value={replace} onChange={(e) => setReplace(e.target.value)} />
          </Field>

          <div className="space-y-2">
            <Checkbox checked={matchCase} onChange={setMatchCase}>
              Match case
            </Checkbox>
            <Checkbox checked={wholeWord} onChange={setWholeWord}>
              Whole words only
            </Checkbox>
            <Checkbox checked={regex} onChange={setRegex}>
              Regular expression
            </Checkbox>
          </div>
        </div>
      </InputPanel>

      <OutputPanel
        label="Result"
        copyText={result?.output || undefined}
        outputType="text"
        download={result?.output ? { filename: "replaced.txt", mimeType: "text/plain" } : undefined}
      >
        {syntaxError ? (
          <Alert id="find-error" title="Invalid pattern">
            {syntaxError}
          </Alert>
        ) : state.status === "timeout" && find ? (
          <Alert tone="warn" title="Stopped after 1 second">
            <p className="text-sm">
              This pattern is taking too long on this text, most likely from nested quantifiers like{" "}
              <code className="font-[family-name:var(--font-mono)]">(a+)+</code>.
            </p>
          </Alert>
        ) : state.status === "error" && find ? (
          <p className="text-[color:var(--error)]">{state.error}</p>
        ) : result ? (
          <>
            <p role="status" className={`mb-4 text-sm ${muted}`}>
              {!find ? "Type something to find." : result.count ? `${plural(result.count, "match", "matches")} replaced.` : "No matches."}
            </p>
            <pre className="whitespace-pre-wrap break-words">{result.output}</pre>
          </>
        ) : (
          <p className={muted}>Replacing…</p>
        )}
      </OutputPanel>
    </>
  );
}

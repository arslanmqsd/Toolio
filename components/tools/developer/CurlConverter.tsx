"use client";

import { useMemo, useState } from "react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import { CodeTextArea } from "@/components/ui/CodeField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { convertCurl, type Target } from "@/lib/tools/developer/curl-to-code";

const EXAMPLE = `curl -X POST https://api.example.com/v1/users \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.demo' \\
  -d '{"name": "Ada Lovelace", "email": "ada@example.com", "roles": ["admin"]}'
`;

const TARGETS = [
  { id: "fetch", label: "Fetch" },
  { id: "axios", label: "Axios" },
  { id: "python", label: "Python requests" },
] as const;

export default function CurlConverter() {
  const [command, setCommand] = useState(EXAMPLE);
  const [target, setTarget] = useState<Target>("fetch");
  const result = useMemo(() => convertCurl(command, target), [command, target]);

  return (
    <>
      <InputPanel label="cURL command">
        <div className="space-y-4">
          <CodeTextArea
            aria-label="cURL command"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            rows={12}
            invalid={!result.ok}
            aria-describedby={!result.ok ? "curl-error" : undefined}
          />
          <SegmentedControl label="Output language" options={TARGETS} value={target} onChange={setTarget} />
          <p className="text-xs text-[color:var(--text-muted)]">
            Paste a command from your terminal or your browser&apos;s &ldquo;Copy as cURL&rdquo;.
          </p>
        </div>
      </InputPanel>

      <OutputPanel label={TARGETS.find((t) => t.id === target)!.label} copyText={result.ok ? result.code : undefined}>
        {result.ok ? (
          <div className="space-y-4">
            <pre className="whitespace-pre [tab-size:2]">{result.code}</pre>
            {result.warnings.length > 0 && (
              <ul className="space-y-1 border-t border-[color:var(--border)] pt-3 font-[family-name:var(--font-ui)] text-xs text-[color:var(--accent-warn-text)]">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Alert id="curl-error" title="Can't convert this command">
            {result.error}
          </Alert>
        )}
      </OutputPanel>
    </>
  );
}

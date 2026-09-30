"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeTextArea } from "@/components/ui/CodeField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { decodeUrl, encodeUrl, looksEncoded, parseUrlParts, type UrlParts, type UrlScheme } from "@/lib/tools/developer/url-encode";

const EXAMPLE = "https://example.com/search?q=café & crème&tags=a/b#results";

const MODES = [
  { id: "encode", label: "Encode" },
  { id: "decode", label: "Decode" },
] as const;

const SCHEMES = [
  { id: "component", label: "Component" },
  { id: "uri", label: "Full URL" },
  { id: "form", label: "Form" },
] as const;

const SCHEME_HELP: Record<UrlScheme, string> = {
  component: "For one query value or path segment. Encodes everything that isn't a letter, digit, or - _ . ! ~ * ' ( ).",
  uri: "For a whole URL. Keeps characters with meaning in URLs, like : / ? # & =, as they are.",
  form: "For HTML form data (application/x-www-form-urlencoded). Spaces become +.",
};

type Mode = (typeof MODES)[number]["id"];

function Breakdown({ parts }: { parts: UrlParts }) {
  const rows: [string, string][] = [
    ["Protocol", parts.protocol],
    ...(parts.username ? ([["User", parts.username]] as [string, string][]) : []),
    ["Host", parts.host],
    ...(parts.port ? ([["Port", parts.port]] as [string, string][]) : []),
    ["Path", parts.pathname],
    ...(parts.hash ? ([["Fragment", parts.hash]] as [string, string][]) : []),
  ];
  return (
    <div className="mt-6 border-t border-[color:var(--border)] pt-4">
      <h3 className="mb-3 font-[family-name:var(--font-ui)] text-sm font-semibold">URL breakdown</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>
      {parts.params.length > 0 && (
        <>
          <h4 className="mb-2 mt-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
            Query parameters (decoded)
          </h4>
          <table className="w-full text-sm">
            <tbody>
              {parts.params.map(([key, value], k) => (
                <tr key={k} className="border-t border-[color:var(--border)]">
                  <td className="py-1.5 pr-4 align-top text-[color:var(--accent-text)]">{key}</td>
                  <td className="break-all py-1.5">{value === "" ? <em className="text-[color:var(--text-muted)]">(empty)</em> : value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default function UrlEncoder() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useToolInput(EXAMPLE);
  const [mode, setMode] = useState<Mode>("encode");
  const [scheme, setScheme] = useState<UrlScheme>("component");

  const result = useMemo(() => (mode === "encode" ? encodeUrl(text, scheme) : decodeUrl(text, scheme)), [text, mode, scheme]);
  // Break down whichever side is the readable URL.
  const parts = useMemo(
    () => parseUrlParts(text) ?? (result.ok ? parseUrlParts(result.output) : null),
    [text, result],
  );
  const stillEncoded = mode === "decode" && result.ok && looksEncoded(result.output);

  function swap() {
    if (!result.ok) return;
    setText(result.output);
    setMode(mode === "encode" ? "decode" : "encode");
  }

  function showError(offset: number) {
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(offset, offset + 1);
  }

  return (
    <>
      <InputPanel label={mode === "encode" ? "Text to encode" : "Text to decode"}>
        <div className="space-y-4">
          <CodeTextArea
            ref={inputRef}
            aria-label={mode === "encode" ? "Text to encode" : "Text to decode"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            invalid={!result.ok}
          />
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl label="Mode" options={MODES} value={mode} onChange={setMode} />
            <SegmentedControl label="Encoding" options={SCHEMES} value={scheme} onChange={setScheme} />
          </div>
          <p className="text-xs text-[color:var(--text-muted)]">{SCHEME_HELP[scheme]}</p>
          <Button icon={ArrowDownUp} onClick={swap} disabled={!result.ok}>
            Use result as input
          </Button>
        </div>
      </InputPanel>

      <OutputPanel label={mode === "encode" ? "Encoded" : "Decoded"} copyText={result.ok ? result.output : undefined} outputType="text">
        {result.ok ? (
          <>
            <pre className="whitespace-pre-wrap break-all">
              {result.output || <span className="text-[color:var(--text-muted)]">(empty)</span>}
            </pre>
            {stillEncoded && (
              <div className="mt-4 flex flex-wrap items-center gap-3 font-[family-name:var(--font-ui)] text-sm text-[color:var(--accent-warn-text)]">
                This still contains encoded characters, so the input may have been encoded twice.
                <Button size="sm" onClick={() => setText(result.output)}>
                  Decode again
                </Button>
              </div>
            )}
            {parts && <Breakdown parts={parts} />}
          </>
        ) : (
          <Alert title={mode === "encode" ? "Can't encode this text" : "Can't decode this text"}>
            <p>{result.error}</p>
            <Button size="sm" onClick={() => showError(result.offset)} className="mt-3">
              Show in input
            </Button>
          </Alert>
        )}
      </OutputPanel>
    </>
  );
}

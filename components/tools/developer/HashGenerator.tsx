"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import ValueTable, { type ValueRow } from "@/components/ui/ValueTable";
import { formatBytes } from "@/lib/format-bytes";
import {
  HASH_ALGORITHMS,
  digestMatches,
  encodeDigest,
  hashAll,
  type DigestEncoding,
  type HashAlgorithm,
} from "@/lib/tools/developer/hash";

const EXAMPLE = "The quick brown fox jumps over the lazy dog";

const SOURCES = [
  { id: "text", label: "Text" },
  { id: "file", label: "File" },
] as const;

const ENCODINGS = [
  { id: "hex", label: "hex" },
  { id: "HEX", label: "HEX" },
  { id: "base64", label: "Base64" },
] as const;

type Source = (typeof SOURCES)[number]["id"];
type Digests = Record<HashAlgorithm, Uint8Array>;
/** Last finished digests, plus progress while a new hash is running (null when idle). */
type HashState = { digests: Digests | null; progress: number | null; error: string | null };

export default function HashGenerator() {
  const [source, setSource] = useState<Source>("text");
  const [text, setText] = useToolInput(EXAMPLE, () => setSource("text"));
  const deferredText = useDeferredValue(text);
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState<DigestEncoding>("hex");
  const [expected, setExpected] = useState("");
  const [state, setState] = useState<HashState>({ digests: null, progress: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const update = (change: Partial<HashState>) => !cancelled && setState((prev) => ({ ...prev, ...change }));

    if (source === "file" && !file) {
      setState({ digests: null, progress: null, error: null });
      return;
    }
    // Text keeps its last result while typing, so the table doesn't flash. A new file clears it:
    // showing the previous file's hashes, even briefly, would be wrong.
    if (source === "file") setState({ digests: null, progress: 0, error: null });
    (async () => {
      try {
        const bytes = source === "text" ? new TextEncoder().encode(deferredText) : new Uint8Array(await file!.arrayBuffer());
        const digests = await hashAll(bytes, (progress) => update({ progress }));
        update({ digests, progress: null, error: null });
      } catch {
        update({ digests: null, progress: null, error: "The browser couldn't read this file. It may be too large to hold in memory." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, deferredText, file]);

  const comparing = expected.trim() !== "";
  const { digests, progress, error } = state;
  const matched = digests && comparing ? HASH_ALGORITHMS.find(({ id }) => digestMatches(digests[id], expected)) : undefined;

  const rows: ValueRow[] = digests
    ? HASH_ALGORITHMS.map(({ id, label, note }) => ({
        key: id,
        label,
        value: encodeDigest(digests[id], encoding),
        note,
        highlight: matched?.id === id ? "match" : undefined,
      }))
    : [];

  return (
    <>
      <InputPanel label="Input">
        <div className="space-y-5">
          <SegmentedControl label="Input type" options={SOURCES} value={source} onChange={setSource} />

          {source === "text" ? (
            <CodeTextArea aria-label="Text to hash" value={text} onChange={(e) => setText(e.target.value)} rows={8} />
          ) : file ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[color:var(--border)] p-3 text-sm">
              <span className="min-w-0 break-all">
                {file.name} <span className="text-[color:var(--text-muted)]">({formatBytes(file.size)})</span>
              </span>
              <Button icon={X} size="sm" onClick={() => setFile(null)}>
                Clear
              </Button>
            </div>
          ) : (
            <FileDrop onFiles={([f]) => setFile(f)} what="any file" />
          )}

          <Field label="Output encoding">
            <SegmentedControl label="Output encoding" options={ENCODINGS} value={encoding} onChange={setEncoding} />
          </Field>

          <Field
            label="Compare with"
            htmlFor="hash-expected"
            help="Paste a checksum (hex or Base64, or a line from a .sha256 file) to check it against these results."
          >
            <CodeInput
              id="hash-expected"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="Expected checksum"
              invalid={Boolean(digests && comparing && !matched)}
            />
          </Field>
        </div>
      </InputPanel>

      <OutputPanel label="Hashes" copyText={rows.find((row) => row.key === "sha256")?.value} outputType="hash">
        {source === "file" && !file && (
          <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">Choose a file to see its hashes.</p>
        )}
        {progress !== null && !digests && (
          <div className="font-[family-name:var(--font-ui)] text-sm text-[color:var(--text-muted)]" aria-live="polite">
            <p>Hashing{progress > 0 ? ` ${Math.round(progress * 100)}%` : "…"}</p>
            <progress value={progress} max={1} aria-label="Hashing progress" className="mt-2 h-1.5 w-full accent-[color:var(--accent)]" />
          </div>
        )}
        {error && <Alert title="Can't hash this file">{error}</Alert>}
        {digests && (
          <div className="space-y-4">
            {comparing &&
              (matched ? (
                <p className="font-[family-name:var(--font-ui)] text-sm text-[color:var(--accent-text)]" role="status">
                  Match: the checksum is this input&apos;s {matched.label}.
                </p>
              ) : (
                <Alert tone="warn" title="No match">
                  The checksum doesn&apos;t match any of these hashes. Check you have the right file and algorithm.
                </Alert>
              ))}
            <ValueTable rows={rows} />
          </div>
        )}
      </OutputPanel>
    </>
  );
}

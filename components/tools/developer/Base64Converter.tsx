"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, X } from "lucide-react";
import ExamplePicker from "@/components/tool-shell/ExamplePicker";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import { detectType } from "@/components/workbench/detectors";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeTextArea } from "@/components/ui/CodeField";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import ValueTable from "@/components/ui/ValueTable";
import { base64ToBytes, bytesToBase64, bytesToText, wrapLines, type Base64Variant } from "@/lib/encoding/base64";
import { formatBytes } from "@/lib/format-bytes";
import { detectFileKind, downloadName, hexDump, parseDataUrl, toDataUrl, type FileKind } from "@/lib/tools/developer/base64";
import { readTextFile } from "@/lib/files/text-file";

const HELLO = "Hello, World! 👋";
// The 5×5 red dot from Wikipedia's data URL article.
const RED_DOT =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";

const EXAMPLES = [
  { id: "greeting", label: "Greeting", mode: "encode", text: HELLO },
  { id: "basic-auth", label: "Basic auth header", mode: "decode", text: "YWRhOmNvcnJlY3QgaG9yc2UgYmF0dGVyeSBzdGFwbGU=" },
  { id: "jwt-payload", label: "JWT payload", mode: "decode", text: "eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iXX0" },
  { id: "image", label: "PNG image", mode: "decode", text: RED_DOT },
] as const;

const MODES = [
  { id: "encode", label: "Encode" },
  { id: "decode", label: "Decode" },
] as const;

const SOURCES = [
  { id: "text", label: "Text" },
  { id: "file", label: "File" },
] as const;

const ALPHABETS = [
  { id: "standard", label: "Standard" },
  { id: "url-safe", label: "URL-safe" },
] as const;

const WRAPS = [
  { width: 0, label: "No line breaks" },
  { width: 76, label: "76 characters (MIME)" },
  { width: 64, label: "64 characters (PEM)" },
] as const;

const VARIANT_LABEL: Record<Base64Variant, string> = { standard: "Standard Base64", "url-safe": "URL-safe Base64 (Base64URL)" };

type Mode = (typeof MODES)[number]["id"];
type Source = (typeof SOURCES)[number]["id"];

const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Beyond this the output box shows a preview; Copy and Download still get everything. */
const DISPLAY_CHARS = 100_000;
const HEX_BYTES = 256;
const ERROR_ID = "base64-error";
const helpClass = "font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]";

interface LoadedFile {
  name: string;
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Decoded bytes are shown as text only when they read as text: valid UTF-8, no NULs, not a known binary format. */
function asText(bytes: Uint8Array, kind: FileKind): string | null {
  if (kind.binary) return null;
  const text = bytesToText(bytes);
  return text === null || text.includes("\0") ? null : text;
}

export default function Base64Converter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>("encode");
  const [source, setSource] = useState<Source>("text");
  const [text, setText] = useToolInput(HELLO, (value) => {
    setSource("text");
    setMode(detectType(value) === "base64" ? "decode" : "encode");
  });
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [alphabet, setAlphabet] = useState<Base64Variant>("standard");
  const [padding, setPadding] = useState(true);
  const [wrap, setWrap] = useState(0);
  const [dataUrl, setDataUrl] = useState(false);

  const deferred = useDeferredValue({ text, mode });
  const encodingFile = mode === "encode" && source === "file";

  const encoded = useMemo(() => {
    if (deferred.mode !== "encode") return null;
    const bytes = source === "file" ? file?.bytes : new TextEncoder().encode(deferred.text);
    if (!bytes) return null;
    const base64 = bytesToBase64(bytes, { urlSafe: alphabet === "url-safe", padding });
    // A data URL is one unbroken string, so it's never wrapped.
    if (dataUrl) return toDataUrl(base64, source === "file" ? file!.type : "text/plain;charset=utf-8");
    return wrapLines(base64, wrap);
  }, [deferred, source, file, alphabet, padding, wrap, dataUrl]);

  const decoded = useMemo(() => {
    if (deferred.mode !== "decode") return null;
    const parsed = parseDataUrl(deferred.text);
    const body = parsed ? parsed.base64 : deferred.text;
    const result = base64ToBytes(body);
    if (!result.ok) {
      // Point at the character in the whole input, not just the part after "data:…,".
      return { ...result, offset: result.offset + (deferred.text.length - body.length) };
    }
    const kind = detectFileKind(result.bytes, parsed?.mimeType);
    return { ...result, kind, text: asText(result.bytes, kind), mimeType: parsed?.mimeType };
  }, [deferred]);

  const empty = mode === "decode" ? text.trim() === "" : encodingFile ? !file : text === "";

  function changeMode(next: Mode) {
    if (next === mode) return;
    // Carry text results across, so a round trip is one click.
    if (next === "decode" && encoded !== null && !encodingFile) setText(encoded);
    if (next === "encode" && decoded?.ok && decoded.text !== null) setText(decoded.text);
    if (next === "encode") setSource("text");
    setMode(next);
  }

  async function loadFile(picked: File) {
    setFileError(undefined);
    if (mode === "decode") {
      const read = await readTextFile(picked, MAX_FILE_BYTES);
      if (read.ok) setText(read.text);
      else setFileError(read.error);
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setFileError(`This file is over ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    try {
      setFile({ name: picked.name, type: picked.type, bytes: new Uint8Array(await picked.arrayBuffer()) });
    } catch {
      setFileError("The browser couldn't read this file.");
    }
  }

  function showError(offset: number) {
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(offset, offset + 1);
  }

  const decodeError = decoded && !decoded.ok && !empty ? decoded : null;

  return (
    <>
      <InputPanel label={mode === "encode" ? "Encode to Base64" : "Decode Base64"}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl label="Mode" options={MODES} value={mode} onChange={changeMode} />
            {mode === "encode" && <SegmentedControl label="Input" options={SOURCES} value={source} onChange={setSource} />}
          </div>

          <ExamplePicker
            examples={EXAMPLES}
            hasUserInput={() => text !== "" && text !== HELLO && !EXAMPLES.some((ex) => ex.text === text)}
            onLoad={(example) => {
              setMode(example.mode);
              setSource("text");
              setText(example.text);
            }}
          />

          {encodingFile ? (
            file ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--border)] px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {file.name} <span className="text-[color:var(--text-muted)]">· {formatBytes(file.bytes.length)}</span>
                </span>
                <Button size="sm" icon={X} onClick={() => setFile(null)}>
                  Remove
                </Button>
              </div>
            ) : (
              <FileDrop what="any file" onFiles={([picked]) => loadFile(picked)} />
            )
          ) : (
            <div className="space-y-2">
              <CodeTextArea
                ref={inputRef}
                aria-label={mode === "encode" ? "Text to encode" : "Base64 to decode"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                spellCheck={false}
                invalid={decodeError !== null}
                aria-describedby={decodeError ? ERROR_ID : undefined}
                placeholder={mode === "encode" ? "Text to encode" : "SGVsbG8sIFdvcmxkIQ== or data:image/png;base64,…"}
              />
              {mode === "decode" && (
                <FileDrop compact what="a file of Base64 text" accept=".txt,.b64,.base64,.pem,text/plain" onFiles={([picked]) => loadFile(picked)} />
              )}
            </div>
          )}
          {fileError && (
            <p role="alert" className="text-xs text-[color:var(--error)]">
              {fileError}
            </p>
          )}

          {mode === "encode" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <SegmentedControl label="Alphabet" options={ALPHABETS} value={alphabet} onChange={setAlphabet} />
                <Checkbox checked={padding} onChange={setPadding}>
                  Pad with =
                </Checkbox>
                <Checkbox checked={dataUrl} onChange={setDataUrl}>
                  Data URL
                </Checkbox>
              </div>
              {!dataUrl && (
                <label className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--text-muted)]">
                  Line breaks
                  <Select value={wrap} onChange={(e) => setWrap(Number(e.target.value))} className="w-56">
                    {WRAPS.map((w) => (
                      <option key={w.width} value={w.width}>
                        {w.label}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              <p className={helpClass}>
                {alphabet === "url-safe"
                  ? "URL-safe Base64 uses - and _ instead of + and /, so it can go in URLs, file names and JWTs. Padding is often left off."
                  : "Standard Base64 (RFC 4648), as used in email, data URLs and HTTP Basic auth."}{" "}
                {!encodingFile && "Text is encoded as UTF-8."}
              </p>
            </div>
          ) : (
            <p className={helpClass}>
              Standard and URL-safe Base64 are both recognised. Missing padding, line breaks and a data: prefix are fine.
            </p>
          )}

          <p className={helpClass}>Encoded and decoded in your browser. Nothing is uploaded.</p>
        </div>
      </InputPanel>

      {mode === "encode" ? (
        <EncodeOutput
          output={empty ? null : encoded}
          emptyHint={encodingFile ? "Choose a file to encode." : "Type some text to encode."}
          filename={encodingFile && file ? `${file.name}.b64.txt` : "encoded.b64.txt"}
          onUseAsInput={encodingFile ? undefined : () => changeMode("decode")}
        />
      ) : decodeError ? (
        <OutputPanel label="Decoded">
          <div id={ERROR_ID}>
            <Alert title="Can't decode this">
              <p>{decodeError.error}</p>
              <Button size="sm" onClick={() => showError(decodeError.offset)} className="mt-3">
                Show in input
              </Button>
            </Alert>
          </div>
        </OutputPanel>
      ) : decoded?.ok && !empty ? (
        decoded.text !== null ? (
          <OutputPanel label="Decoded text" copyText={decoded.text} outputType="text" download={{ filename: "decoded.txt", mimeType: "text/plain" }}>
            <DecodedSummary variant={decoded.variant} padded={decoded.padded} bytes={decoded.bytes.length} />
            <LongText text={decoded.text} />
            <div className="mt-4 font-[family-name:var(--font-ui)]">
              <Button icon={ArrowDownUp} onClick={() => changeMode("encode")}>
                Use result as input
              </Button>
            </div>
          </OutputPanel>
        ) : (
          <BinaryOutput bytes={decoded.bytes} kind={decoded.kind} variant={decoded.variant} padded={decoded.padded} />
        )
      ) : (
        <OutputPanel label="Decoded">
          <p className={helpClass}>Paste Base64 to decode it.</p>
        </OutputPanel>
      )}
    </>
  );
}

interface EncodeOutputProps {
  output: string | null;
  emptyHint: string;
  filename: string;
  onUseAsInput?: () => void;
}

function EncodeOutput({ output, emptyHint, filename, onUseAsInput }: EncodeOutputProps) {
  return (
    <OutputPanel
      label="Base64"
      copyText={output ?? undefined}
      outputType="text"
      download={output ? { filename, mimeType: "text/plain" } : undefined}
    >
      {output === null ? (
        <p className={helpClass}>{emptyHint}</p>
      ) : (
        <>
          <p className={`${helpClass} mb-3 tabular-nums`} role="status">
            {output.length.toLocaleString()} characters
          </p>
          <LongText text={output} />
          {onUseAsInput && (
            <div className="mt-4 font-[family-name:var(--font-ui)]">
              <Button icon={ArrowDownUp} onClick={onUseAsInput}>
                Use result as input
              </Button>
            </div>
          )}
        </>
      )}
    </OutputPanel>
  );
}

/** Long output would make the page crawl, so only the start is shown; Copy and Download have it all. */
function LongText({ text }: { text: string }) {
  const clipped = text.length > DISPLAY_CHARS;
  return (
    <>
      <pre className="whitespace-pre-wrap break-all">{clipped ? `${text.slice(0, DISPLAY_CHARS)}…` : text || <span className="text-[color:var(--text-muted)]">(empty)</span>}</pre>
      {clipped && (
        <p className={`${helpClass} mt-3`}>
          Showing the first {DISPLAY_CHARS.toLocaleString()} of {text.length.toLocaleString()} characters. Copy and Download include all of it.
        </p>
      )}
    </>
  );
}

function DecodedSummary({ variant, padded, bytes }: { variant: Base64Variant | null; padded: boolean; bytes: number }) {
  return (
    <p className={`${helpClass} mb-3`} role="status">
      {variant ? VARIANT_LABEL[variant] : "Base64"}, {padded ? "padded" : "no padding"} · {formatBytes(bytes)}
    </p>
  );
}

interface BinaryOutputProps {
  bytes: Uint8Array<ArrayBuffer>;
  kind: FileKind;
  variant: Base64Variant | null;
  padded: boolean;
}

function BinaryOutput({ bytes, kind, variant, padded }: BinaryOutputProps) {
  const previewUrl = useObjectUrl(kind.previewable ? bytes : null, kind.mimeType);
  const filename = downloadName(kind.extension);

  return (
    <OutputPanel label="Decoded file" download={{ filename, mimeType: kind.mimeType, content: bytes }}>
      <DecodedSummary variant={variant} padded={padded} bytes={bytes.length} />
      <div className="font-[family-name:var(--font-ui)]">
        <ValueTable
          rows={[
            { label: "Type", value: kind.label },
            { label: "Size", value: `${formatBytes(bytes.length)} (${bytes.length.toLocaleString()} bytes)` },
          ]}
        />
      </div>
      {previewUrl && (
        <figure className="mt-4">
          {/* A blob: URL of decoded bytes, so next/image has nothing to optimise. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={`Decoded ${kind.label}`}
            className="max-h-80 max-w-full rounded-md border border-[color:var(--border)] [image-rendering:pixelated]"
            style={{ minWidth: "4rem" }}
          />
        </figure>
      )}
      {!kind.previewable && (
        <p className={`${helpClass} mt-4`}>This isn&apos;t text. Use Download to save it as {filename}.</p>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
          Hex view{bytes.length > HEX_BYTES ? ` (first ${HEX_BYTES} bytes)` : ""}
        </summary>
        <pre className="mt-2 overflow-x-auto text-xs">{hexDump(bytes, HEX_BYTES)}</pre>
      </details>
    </OutputPanel>
  );
}

/** A blob: URL for `bytes`, revoked when the bytes change or the component goes away. */
function useObjectUrl(bytes: Uint8Array<ArrayBuffer> | null, mimeType: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes, mimeType]);
  return url;
}

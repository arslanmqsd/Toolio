"use client";

import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import Select from "@/components/ui/Select";
import type { Algorithm, CustomScheme, Encoding, KeyFormat } from "@/lib/tools/developer/webhook/signature";

const TEMPLATES = ["{body}", "{timestamp}.{body}", "{id}.{timestamp}.{body}"];
const ALGORITHMS: Algorithm[] = ["SHA-256", "SHA-1", "SHA-512"];

/** Settings for a webhook signed your own way. */
export default function CustomSchemeEditor({ value: c, onChange }: { value: CustomScheme; onChange: (c: CustomScheme) => void }) {
  const set = <K extends keyof CustomScheme>(key: K, v: CustomScheme[K]) => onChange({ ...c, [key]: v });
  const hasTimestamp = c.template.includes("{timestamp}");
  const hasId = c.template.includes("{id}");

  return (
    <div className="space-y-4 rounded-md border border-[color:var(--border)] p-3">
      <Field
        label="What’s signed"
        htmlFor="custom-template"
        help={
          <>
            {"{body}"} is the request body; {"{timestamp}"} is Unix seconds and {"{id}"} a message id, each sent in its own header. Common:{" "}
            {TEMPLATES.map((t, i) => (
              <span key={t}>
                {i > 0 && ", "}
                <button type="button" onClick={() => set("template", t)} className="font-[family-name:var(--font-mono)] text-[color:var(--accent-text)] hover:underline">
                  {t}
                </button>
              </span>
            ))}
            .
          </>
        }
      >
        <CodeInput id="custom-template" value={c.template} onChange={(e) => set("template", e.target.value)} invalid={!c.template.includes("{body}")} spellCheck={false} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Hash" htmlFor="custom-alg">
          <Select id="custom-alg" value={c.algorithm} onChange={(e) => set("algorithm", e.target.value as Algorithm)}>
            {ALGORITHMS.map((a) => (
              <option key={a} value={a}>
                HMAC-{a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Output" htmlFor="custom-enc">
          <Select id="custom-enc" value={c.encoding} onChange={(e) => set("encoding", e.target.value as Encoding)}>
            <option value="hex">Hex</option>
            <option value="base64">Base64</option>
          </Select>
        </Field>
        <Field label="Secret is" htmlFor="custom-key">
          <Select id="custom-key" value={c.keyFormat} onChange={(e) => set("keyFormat", e.target.value as KeyFormat)}>
            <option value="text">Text</option>
            <option value="base64">Base64 bytes</option>
            <option value="hex">Hex bytes</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Signature header" htmlFor="custom-header">
          <CodeInput id="custom-header" value={c.header} onChange={(e) => set("header", e.target.value)} invalid={!c.header.trim()} spellCheck={false} />
        </Field>
        <Field label="Prefix" htmlFor="custom-prefix" help="Written before the signature, like sha256= or v1=. Leave blank for none.">
          <CodeInput id="custom-prefix" value={c.prefix} onChange={(e) => set("prefix", e.target.value)} spellCheck={false} />
        </Field>
        {hasTimestamp && (
          <Field label="Timestamp header" htmlFor="custom-ts-header">
            <CodeInput id="custom-ts-header" value={c.timestampHeader} onChange={(e) => set("timestampHeader", e.target.value)} invalid={!c.timestampHeader.trim()} spellCheck={false} />
          </Field>
        )}
        {hasId && (
          <Field label="Id header" htmlFor="custom-id-header">
            <CodeInput id="custom-id-header" value={c.idHeader} onChange={(e) => set("idHeader", e.target.value)} invalid={!c.idHeader.trim()} spellCheck={false} />
          </Field>
        )}
      </div>
    </div>
  );
}

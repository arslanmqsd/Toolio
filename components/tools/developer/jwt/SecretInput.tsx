"use client";

import type { ReactNode } from "react";
import Field from "@/components/ui/Field";
import PasswordInput from "@/components/ui/PasswordInput";
import Select from "@/components/ui/Select";
import type { KeyFormat } from "@/lib/encoding/key-bytes";

interface SecretInputProps {
  id: string;
  secret: string;
  onSecret: (secret: string) => void;
  format: KeyFormat;
  onFormat: (format: KeyFormat) => void;
  /** A control on the label row, like a Generate button. */
  action?: ReactNode;
  help?: ReactNode;
  invalid?: boolean;
}

/** An HMAC secret, and whether it's used as typed or decoded from Base64 or hex first. */
export default function SecretInput({ id, secret, onSecret, format, onFormat, action, help, invalid }: SecretInputProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
      <Field label="Secret" htmlFor={id} action={action} help={help}>
        <PasswordInput
          id={id}
          value={secret}
          onChange={(e) => onSecret(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          className="font-[family-name:var(--font-mono)]"
        />
      </Field>
      <Field label="Secret is" htmlFor={`${id}-format`}>
        <Select id={`${id}-format`} value={format} onChange={(e) => onFormat(e.target.value as KeyFormat)}>
          <option value="text">Text</option>
          <option value="base64">Base64 bytes</option>
          <option value="hex">Hex bytes</option>
        </Select>
      </Field>
    </div>
  );
}

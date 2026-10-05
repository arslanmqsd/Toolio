"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

export interface ExampleOption {
  id: string;
  label: string;
}

interface ExamplePickerProps<T extends ExampleOption> {
  examples: readonly T[];
  /** True when the input holds something the user wrote, so loading an example asks first. */
  hasUserInput: () => boolean;
  onLoad: (example: T) => void;
}

/**
 * A row of example buttons. Loading one replaces the input straight away when that loses nothing;
 * otherwise an inline Replace / Cancel asks first.
 */
export default function ExamplePicker<T extends ExampleOption>({ examples, hasUserInput, onLoad }: ExamplePickerProps<T>) {
  const [pending, setPending] = useState<T | null>(null);

  function pick(example: T) {
    if (hasUserInput()) {
      setPending(example);
      return;
    }
    setPending(null);
    onLoad(example);
  }

  return (
    <>
      <div role="group" aria-label="Examples" className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[color:var(--text-muted)]">Examples:</span>
        {examples.map((example) => (
          <Button key={example.id} size="sm" onClick={() => pick(example)}>
            {example.label}
          </Button>
        ))}
      </div>
      {pending && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--border)] p-3 text-sm">
          <span className="mr-auto">Replace your text with the {pending.label} example?</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              onLoad(pending);
              setPending(null);
            }}
          >
            Replace
          </Button>
          <Button size="sm" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Field from "@/components/ui/Field";
import FormError from "@/components/ui/FormError";
import TextInput from "@/components/ui/TextInput";
import { MAX_SNIPPET_LABEL, useSync, validateSnippet } from "@/lib/sync";
import { panelButtonClass } from "./panel-styles";
import { useToolIO } from "./tool-io";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/** "Save this input" in the input panel header, for signed-in visitors: names the input and saves it as a snippet. */
export default function SaveSnippetButton() {
  const io = useToolIO();
  const { ready, signedIn, saveSnippet } = useSync();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // "Saved" shows on the button for a moment after the dialog closes.
  useEffect(() => {
    if (status.kind !== "saved") return;
    const timer = setTimeout(() => setStatus({ kind: "idle" }), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  // Also keeps the portal below out of server rendering: `ready` is false there.
  if (!ready || !signedIn || !io?.hasInput) return null;
  const { tool, read } = io;

  function show() {
    setLabel("");
    setStatus({ kind: "idle" });
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const value = read() ?? "";
    if (!value.trim()) return setStatus({ kind: "error", message: "The input is empty, so there's nothing to save." });
    let name: string;
    try {
      name = validateSnippet(label, value);
    } catch (error) {
      return setStatus({ kind: "error", message: (error as Error).message });
    }
    setStatus({ kind: "saving" });
    try {
      await saveSnippet(tool.id, name, value);
    } catch {
      return setStatus({ kind: "error", message: "Couldn't save the snippet. Check your connection and try again." });
    }
    setOpen(false);
    setStatus({ kind: "saved" });
  }

  const error = status.kind === "error" ? status.message : null;

  return (
    <>
      <button type="button" onClick={show} className={panelButtonClass}>
        <span aria-live="polite">{status.kind === "saved" && !open ? "Saved" : "Save this input"}</span>
      </button>
      {/* Portaled so the dialog doesn't inherit the panel header's small, muted (per theme, uppercase) text. */}
      {createPortal(
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Save this input"
          description={`Name it to find it on your dashboard and load it back into ${tool.title}.`}
        >
          <form onSubmit={save} className="space-y-4">
            <Field label="Name" htmlFor="snippet-label">
              <TextInput
                id="snippet-label"
                autoFocus
                required
                maxLength={MAX_SNIPPET_LABEL}
                placeholder="e.g. Staging API token"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (error) setStatus({ kind: "idle" });
                }}
                aria-invalid={error !== null || undefined}
                aria-describedby={error ? "snippet-error" : undefined}
              />
            </Field>
            {error && <FormError id="snippet-error">{error}</FormError>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={status.kind === "saving"}>
                {status.kind === "saving" ? "Saving…" : "Save snippet"}
              </Button>
            </div>
          </form>
        </Dialog>,
        document.body,
      )}
    </>
  );
}

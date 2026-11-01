"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LockOpen } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import PasswordInput from "@/components/ui/PasswordInput";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { saveFile } from "@/lib/save-file";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import type { Lock } from "@/lib/tools/files/pdf-protect";
import type { PdfProtectRequest } from "@/lib/tools/files/pdf-protect.worker";
import { runWorkerTask } from "@/lib/worker-task";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-protect.worker.ts", import.meta.url));
}

type Check = { status: "none" } | { status: "checking" } | { status: "ready"; lock: Lock } | { status: "error"; error: string };
type Job = { status: "idle" } | { status: "working" } | { status: "done"; bytes: Uint8Array; lock: Lock } | { status: "error"; error: string };

export default function UnlockPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<Check>({ status: "none" });
  const [password, setPassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [job, setJob] = useState<Job>({ status: "idle" });
  const cancelJob = useRef(() => {});
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordId = useId();
  const wrongId = useId();

  // Find out what's locking the file as soon as it's chosen, so only the needed steps show.
  useEffect(() => {
    setPassword("");
    setWrongPassword(false);
    if (!file) return setCheck({ status: "none" });
    if (file.size > PDF_MAX_BYTES) return setCheck({ status: "error", error: `This file is over ${formatBytes(PDF_MAX_BYTES)}, too big to process in the browser.` });
    let cancel = () => {};
    let cancelled = false;
    setCheck({ status: "checking" });
    file
      .arrayBuffer()
      .then((bytes) => {
        if (cancelled) return;
        const task = runWorkerTask<PdfProtectRequest, never, Lock>(createWorker, { kind: "lock", bytes }, { transfer: [bytes] });
        cancel = task.cancel;
        return task.result;
      })
      .then((lock) => !cancelled && lock && setCheck({ status: "ready", lock }))
      .catch((err: Error) => !cancelled && err.message !== "cancelled" && setCheck({ status: "error", error: pdfErrorMessage(err.message) }));
    return () => {
      cancelled = true;
      cancel();
    };
  }, [file]);

  // A new file or password makes an earlier result out of date.
  useEffect(() => {
    cancelJob.current();
    setJob({ status: "idle" });
  }, [file, password]);

  useEffect(() => () => cancelJob.current(), []);

  const lock = check.status === "ready" ? check.lock : null;
  const ready = lock === "restrictions" || (lock === "password" && password !== "");
  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-unlocked.pdf") : "unlocked.pdf";

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!file || !lock || !ready) return;
    setJob({ status: "working" });
    try {
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfProtectRequest, never, Uint8Array>(createWorker, { kind: "unlock", bytes, password: lock === "password" ? password : "" }, { transfer: [bytes] });
      cancelJob.current = task.cancel;
      const result = await task.result;
      setJob({ status: "done", bytes: result, lock });
      saveFile(result as Uint8Array<ArrayBuffer>, outName, "application/pdf");
    } catch (err) {
      const message = (err as Error).message;
      if (message === "cancelled") return;
      if (message === "password") {
        setJob({ status: "idle" });
        setWrongPassword(true);
        passwordRef.current?.select();
        return;
      }
      setJob({ status: "error", error: pdfErrorMessage(message) });
    }
  }

  return (
    <>
      <InputPanel label="PDF">
        <div className="space-y-4">
          {file ? (
            <SelectedFile
              file={file}
              onClear={() => setFile(null)}
              detail={check.status === "checking" ? "checking…" : lock === "password" ? "password-protected" : lock === "restrictions" ? "restricted" : undefined}
            />
          ) : (
            <FileDrop onFiles={([f]) => setFile(f)} accept="application/pdf,.pdf" what="a PDF" />
          )}

          {check.status === "error" && <Alert title="Couldn't open this PDF">{check.error}</Alert>}
          {lock === "none" && (
            <Alert title="Nothing to unlock" tone="warn">
              This PDF has no password and no restrictions, so it&apos;s already free to open, print and copy.
            </Alert>
          )}

          {(lock === "password" || lock === "restrictions") && (
            <form onSubmit={start} className="space-y-4">
              {lock === "password" ? (
                <>
                  <Field label="PDF password" htmlFor={passwordId}>
                    <PasswordInput
                      ref={passwordRef}
                      id={passwordId}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setWrongPassword(false);
                      }}
                      autoComplete="off"
                      aria-invalid={wrongPassword}
                      aria-describedby={wrongPassword ? wrongId : undefined}
                      autoFocus
                    />
                  </Field>
                  {wrongPassword ? (
                    <p id={wrongId} role="alert" className="text-sm text-[color:var(--error)]">
                      That password isn&apos;t right. Check it, including capitals, and try again.
                    </p>
                  ) : (
                    <p className="text-sm text-[color:var(--text-muted)]">This PDF needs its password to open. Enter it once and the new copy won&apos;t ask again.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-[color:var(--text-muted)]">
                  This PDF opens without a password but limits printing, copying or editing. Unlocking removes those limits; no password needed.
                </p>
              )}
              <Button type="submit" variant="primary" icon={LockOpen} disabled={!ready || job.status === "working"}>
                Unlock PDF
              </Button>
              <p className="text-xs text-[color:var(--text-muted)]">
                Only unlock PDFs you&apos;re allowed to. A password-protected PDF can&apos;t be unlocked without its password: this tool doesn&apos;t guess or break them.
              </p>
            </form>
          )}
        </div>
      </InputPanel>

      <OutputPanel
        label="Unlocked PDF"
        copyable={false}
        download={job.status === "done" ? { filename: outName, mimeType: "application/pdf", content: job.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className="text-[color:var(--text-muted)]">{!file ? "Choose a PDF." : lock === "password" ? "Enter the password, then press Unlock PDF." : "Press Unlock PDF."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label="Unlocking…"
              onCancel={() => {
                cancelJob.current();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't unlock this PDF">{job.error}</Alert>
          ) : (
            <div className="space-y-1">
              <p className="text-base">
                <span className="font-semibold">{job.lock === "password" ? "Password removed" : "Restrictions removed"}</span>
                <span className="text-[color:var(--text-muted)]"> · {formatBytes(job.bytes.length)}</span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">Downloaded as {outName}. Use Download above to save it again.</p>
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

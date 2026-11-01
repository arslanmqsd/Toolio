"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import PasswordInput from "@/components/ui/PasswordInput";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import { saveFile } from "@/lib/save-file";
import { pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import type { PdfProtectRequest } from "@/lib/tools/files/pdf-protect.worker";
import { runWorkerTask } from "@/lib/worker-task";
import { usePdfPages } from "./usePdfPages";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-protect.worker.ts", import.meta.url));
}

/** Shorter than this gets a warning, not a block: it's the person's file and their call. */
const GOOD_LENGTH = 8;

type Job = { status: "idle" } | { status: "working" } | { status: "done"; bytes: Uint8Array } | { status: "error"; error: string };

export default function ProtectPdf() {
  const [file, setFile] = useState<File | null>(null);
  // Opening the file checks it's a PDF without a password already; no previews needed.
  const { doc } = usePdfPages(file, 0);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [job, setJob] = useState<Job>({ status: "idle" });
  const cancelJob = useRef(() => {});
  const passwordId = useId();
  const confirmId = useId();
  const hintId = useId();
  const mismatchId = useId();

  // A new file or password makes an earlier result out of date.
  useEffect(() => {
    cancelJob.current();
    setJob({ status: "idle" });
  }, [file, password]);

  useEffect(() => () => cancelJob.current(), []);

  const mismatch = confirm !== "" && confirm !== password;
  const ready = doc.status === "ready" && password !== "" && confirm === password;
  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-protected.pdf") : "protected.pdf";

  async function start(e: FormEvent) {
    e.preventDefault();
    if (!file || !ready) return;
    setJob({ status: "working" });
    try {
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfProtectRequest, never, Uint8Array>(createWorker, { kind: "protect", bytes, password }, { transfer: [bytes] });
      cancelJob.current = task.cancel;
      const result = await task.result;
      setJob({ status: "done", bytes: result });
      saveFile(result as Uint8Array<ArrayBuffer>, outName, "application/pdf");
    } catch (err) {
      if ((err as Error).message !== "cancelled") setJob({ status: "error", error: pdfErrorMessage((err as Error).message) });
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
              detail={doc.status === "ready" ? plural(doc.pages, "page", "pages") : doc.status === "opening" ? "opening…" : undefined}
            />
          ) : (
            <FileDrop onFiles={([f]) => setFile(f)} accept="application/pdf,.pdf" what="a PDF" />
          )}

          {doc.status === "error" && <Alert title="Couldn't open this PDF">{doc.error}</Alert>}

          <form onSubmit={start} className="space-y-4">
            <Field label="Password" htmlFor={passwordId}>
              <PasswordInput
                id={passwordId}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-describedby={hintId}
              />
            </Field>
            <p id={hintId} className={`text-sm ${password && password.length < GOOD_LENGTH ? "text-[color:var(--accent-warn-text)]" : "text-[color:var(--text-muted)]"}`}>
              {password && password.length < GOOD_LENGTH
                ? `Short passwords are easy to guess. ${GOOD_LENGTH} or more characters, mixing words and numbers, is much safer.`
                : "Anyone opening the PDF will need this password."}
            </p>
            <Field label="Repeat password" htmlFor={confirmId}>
              <PasswordInput
                id={confirmId}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                aria-invalid={mismatch}
                aria-describedby={mismatch ? mismatchId : undefined}
              />
            </Field>
            {mismatch && (
              <p id={mismatchId} className="text-sm text-[color:var(--error)]">
                The passwords don&apos;t match.
              </p>
            )}
            <Button type="submit" variant="primary" icon={Lock} disabled={!ready || job.status === "working"}>
              Protect PDF
            </Button>
            <p className="text-xs text-[color:var(--text-muted)]">
              Encrypted with AES-256. Keep the password somewhere safe: if it&apos;s lost, the PDF can&apos;t be opened, and there&apos;s no way to recover it.
            </p>
          </form>
        </div>
      </InputPanel>

      <OutputPanel
        label="Protected PDF"
        copyable={false}
        download={job.status === "done" ? { filename: outName, mimeType: "application/pdf", content: job.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className="text-[color:var(--text-muted)]">{file ? "Choose a password, then press Protect PDF." : "Choose a PDF."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label="Encrypting…"
              onCancel={() => {
                cancelJob.current();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't protect this PDF">{job.error}</Alert>
          ) : (
            <div className="space-y-1">
              <p className="text-base">
                Protected with <span className="font-semibold">AES-256</span>
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

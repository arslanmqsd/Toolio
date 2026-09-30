"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { MailCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Field from "@/components/ui/Field";
import TextInput from "@/components/ui/TextInput";
import { useAuth } from "@/lib/auth-context";
import { authCallbackUrl } from "@/lib/auth-redirect";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "redirecting" }
  | { kind: "error"; message: string };

function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

/** Supabase errors are terse; say what happened and what to do. */
function describeError(error: { message: string; status?: number }): string {
  if (error.status === 429 || /rate limit|seconds/i.test(error.message)) {
    return "Too many sign-in emails in a short time. Wait a minute, then try again.";
  }
  return error.message || "Sign-in failed. Try again.";
}

interface SignInDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Magic-link and Google sign-in. Both return through /auth/callback to the page the dialog opened on. */
export default function SignInDialog({ open, onClose }: SignInDialogProps) {
  const { supabase } = useAuth();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "sending" || status.kind === "redirecting";

  function close() {
    onClose();
    // Reset once closed, so reopening starts fresh but a sent state survives until then.
    if (status.kind !== "sent") setStatus({ kind: "idle" });
  }

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setStatus({ kind: "sending" });
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl(pathname) },
    });
    setStatus(error ? { kind: "error", message: describeError(error) } : { kind: "sent", email: email.trim() });
  }

  async function continueWithGoogle() {
    if (!supabase) return;
    setStatus({ kind: "redirecting" });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl(pathname) },
    });
    // On success the browser is already leaving for Google.
    if (error) setStatus({ kind: "error", message: describeError(error) });
  }

  if (status.kind === "sent") {
    return (
      <Dialog open={open} onClose={close} title="Check your email">
        <div className="space-y-4 text-sm">
          <p className="flex gap-3">
            <MailCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent-text)]" />
            <span>
              We sent a sign-in link to <strong className="break-all">{status.email}</strong>. Open it in this browser
              to finish signing in. It expires in an hour.
            </span>
          </p>
          <Button onClick={() => setStatus({ kind: "idle" })}>Use a different email</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Sign in to Toolio"
      description="Save favorite tools, history and snippets across devices. Every tool still works without an account."
    >
      <div className="space-y-5">
        <Button onClick={continueWithGoogle} disabled={busy} size="lg" className="w-full">
          <GoogleIcon />
          {status.kind === "redirecting" ? "Opening Google…" : "Continue with Google"}
        </Button>

        <div className="flex items-center gap-3 text-xs text-[color:var(--text-muted)]">
          <span className="h-px flex-1 bg-[color:var(--border)]" />
          or
          <span className="h-px flex-1 bg-[color:var(--border)]" />
        </div>

        <form onSubmit={sendLink} className="space-y-3">
          <Field label="Email" htmlFor="sign-in-email">
            <TextInput
              id="sign-in-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={status.kind === "error" ? "sign-in-error" : undefined}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
            {status.kind === "sending" ? "Sending link…" : "Email me a sign-in link"}
          </Button>
        </form>

        {status.kind === "error" && (
          <p id="sign-in-error" role="alert" className="text-sm text-[color:var(--error)]">
            {status.message}
          </p>
        )}
      </div>
    </Dialog>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { MailCheck } from "lucide-react";
import { isAuthWeakPasswordError, type AuthError } from "@supabase/supabase-js";
import { LogoMark } from "@/components/layout/Logo";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Field from "@/components/ui/Field";
import FormError from "@/components/ui/FormError";
import PasswordInput from "@/components/ui/PasswordInput";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TextInput from "@/components/ui/TextInput";
import { MIN_PASSWORD_LENGTH, useAuth } from "@/lib/auth-context";
import { authCallbackUrl } from "@/lib/auth-redirect";
import { googleSignInEnabled } from "@/lib/supabase/env";

type Method = "link" | "password";

/** The dialog's screens: the sign-in form, or the "Reset your password" step behind "Forgot password?". */
type View = "sign-in" | "forgot";

const METHODS = [
  { id: "link", label: "Email link" },
  { id: "password", label: "Password" },
] as const;

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  /** An email went out: a sign-in link, a new account's confirmation link, or a password reset link. */
  | { kind: "sent"; email: string; purpose: "sign-in" | "confirm" | "reset" }
  | { kind: "redirecting" }
  /** `field`: which input the problem is in, so it gets the error border ("both" for a wrong email/password pair). */
  | { kind: "error"; message: string; field: "email" | "password" | "both" | null };

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

/** Where a password reset link lands: signed in, at the dashboard's password form. */
const RESET_PASSWORD_PATH = "/dashboard#password";

const SENT_MESSAGE = {
  "sign-in": "We sent a sign-in link to ",
  confirm: "We sent a link to confirm your account to ",
  reset: "We sent a link to reset your password to ",
} as const;

/** The input an error is about. Rate limits, an unconfirmed account and the like aren't about either. */
const ERROR_FIELD: Record<string, "email" | "password" | "both"> = {
  invalid_credentials: "both",
  validation_failed: "both",
  user_already_exists: "email",
  email_exists: "email",
  email_address_invalid: "email",
  weak_password: "password",
};

function errorStatus(error: AuthError): Status {
  return { kind: "error", message: describeError(error), field: ERROR_FIELD[error.code ?? ""] ?? null };
}

/** Supabase errors are terse; say what happened and what to do. */
function describeError(error: AuthError): string {
  // Supabase lists every allowed character ("…abcdefghijklmnopqrstuvwxyz, 0123456789"); say it plainly.
  if (isAuthWeakPasswordError(error)) {
    return error.reasons.includes("pwned")
      ? "That password has appeared in a known data breach. Choose a different one."
      : "That password is too weak. Make it longer and mix upper- and lowercase letters, numbers and symbols.";
  }
  switch (error.code) {
    case "invalid_credentials":
      return "Wrong email or password. Check both, or use “Forgot password?” to set a new one.";
    case "email_not_confirmed":
      return "Confirm your email first: open the link we sent when you created the account.";
    case "email_address_not_authorized":
      // Supabase's built-in email service only delivers to the project's team; custom SMTP lifts this.
      return "We can't send email to this address yet. Try again later, or use a different sign-in method.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Sign in instead.";
  }
  // Supabase has three limits here, and only the last one clears in about a minute.
  const wait = /after (\d+) seconds?/i.exec(error.message);
  if (wait) return `You just asked for an email. Wait ${wait[1]} seconds, then try again.`;
  if (error.code === "over_email_send_rate_limit") {
    return "We've sent too many emails in the past hour. Try again later, or sign in with a password if you have one.";
  }
  if (error.status === 429) return "Too many attempts in a short time. Wait a minute, then try again.";
  return error.message || "Sign-in failed. Try again.";
}

const logo = <LogoMark className="h-10 w-10 text-[color:var(--brand-accent-text)]" />;

interface SignInDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Magic-link and email + password sign-in, password sign-up and reset, and Google when it's enabled.
 * Emailed links and Google return through /auth/callback; a password sign-in completes in place.
 */
export default function SignInDialog({ open, onClose }: SignInDialogProps) {
  const { supabase } = useAuth();
  const pathname = usePathname();
  const [view, setView] = useState<View>("sign-in");
  const [method, setMethod] = useState<Method>("link");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "sending" || status.kind === "redirecting";
  const error = status.kind === "error" ? status : null;

  function close() {
    onClose();
    // Reopening always starts at the sign-in form. The email is kept, so it needn't be typed again.
    setView("sign-in");
    setCreating(false);
    setPassword("");
    setStatus({ kind: "idle" });
  }

  /** Editing a field clears the error about it. */
  function clearError() {
    if (status.kind === "error") setStatus({ kind: "idle" });
  }

  function showView(next: View) {
    setView(next);
    setStatus({ kind: "idle" });
  }

  function chooseMethod(next: Method) {
    setMethod(next);
    setStatus({ kind: "idle" });
  }

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setStatus({ kind: "sending" });
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl(pathname) },
    });
    setStatus(error ? errorStatus(error) : { kind: "sent", email: email.trim(), purpose: "sign-in" });
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setStatus({ kind: "sending" });
    const credentials = { email: email.trim(), password };

    if (creating) {
      const { data, error } = await supabase.auth.signUp({
        ...credentials,
        options: { emailRedirectTo: authCallbackUrl(pathname) },
      });
      if (error) return setStatus(errorStatus(error));
      // With email confirmation on there's no session yet (and, for an address that already has an account,
      // Supabase answers the same way on purpose, so this can't be used to probe for accounts).
      if (!data.session) return setStatus({ kind: "sent", email: credentials.email, purpose: "confirm" });
    } else {
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) return setStatus(errorStatus(error));
    }
    // Signed in: the auth provider picks up the session and the nav swaps to the user menu.
    close();
  }

  async function sendPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setStatus({ kind: "sending" });
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authCallbackUrl(RESET_PASSWORD_PATH),
    });
    setStatus(error ? errorStatus(error) : { kind: "sent", email: email.trim(), purpose: "reset" });
  }

  async function continueWithGoogle() {
    if (!supabase) return;
    setStatus({ kind: "redirecting" });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl(pathname) },
    });
    // On success the browser is already leaving for Google.
    if (error) setStatus(errorStatus(error));
  }

  if (status.kind === "sent") {
    return (
      <Dialog open={open} onClose={close} icon={logo} title="Check your email">
        <div className="space-y-4 text-sm">
          <p className="flex gap-3">
            <MailCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent-text)]" />
            <span>
              {SENT_MESSAGE[status.purpose]}
              <strong className="break-all">{status.email}</strong>. Open it in this browser{" "}
              {status.purpose === "reset" ? "to choose a new password" : "to finish signing in"}. It expires in an hour.
            </span>
          </p>
          <Button onClick={() => setStatus({ kind: "idle" })}>Use a different email</Button>
        </div>
      </Dialog>
    );
  }

  const emailField = (
    <Field label="Email" htmlFor="sign-in-email">
      <TextInput
        id="sign-in-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          clearError();
        }}
        aria-invalid={error?.field === "email" || error?.field === "both" || undefined}
        aria-describedby={error ? "sign-in-error" : undefined}
      />
    </Field>
  );

  // Sits just above each form's submit button, next to the fields it's about.
  const errorMessage = error && <FormError id="sign-in-error">{error.message}</FormError>;

  if (view === "forgot") {
    return (
      <Dialog
        open={open}
        onClose={close}
        icon={logo}
        title="Reset your password"
        description="Enter the email you signed up with and we'll send you a link to choose a new password."
      >
        <div className="space-y-5">
          <form onSubmit={sendPasswordReset} className="space-y-3">
            {emailField}
            {errorMessage}
            <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
              {status.kind === "sending" ? "Sending link…" : "Send reset link"}
            </Button>
            <p className="pt-1 text-center text-sm">
              <button
                type="button"
                onClick={() => showView("sign-in")}
                className="font-medium text-[color:var(--accent-text)] hover:underline"
              >
                Back to sign in
              </button>
            </p>
          </form>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      icon={logo}
      title={method === "password" && creating ? "Create your Toolio account" : "Sign in to Toolio"}
      description="Save favorite tools, history and snippets across devices. Every tool still works without an account."
    >
      <div className="space-y-5">
        {googleSignInEnabled && (
          <>
            <Button onClick={continueWithGoogle} disabled={busy} size="lg" className="w-full">
              <GoogleIcon />
              {status.kind === "redirecting" ? "Opening Google…" : "Continue with Google"}
            </Button>

            <div className="flex items-center gap-3 text-xs text-[color:var(--text-muted)]">
              <span className="h-px flex-1 bg-[color:var(--border)]" />
              or use your email
              <span className="h-px flex-1 bg-[color:var(--border)]" />
            </div>
          </>
        )}

        <SegmentedControl label="Email sign-in method" options={METHODS} value={method} onChange={chooseMethod} variant="tabs" />

        {method === "link" ? (
          <form onSubmit={sendLink} className="space-y-3">
            {emailField}
            {errorMessage}
            <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
              {status.kind === "sending" ? "Sending link…" : "Email me a sign-in link"}
            </Button>
          </form>
        ) : (
          <form onSubmit={submitPassword} className="space-y-3">
            {emailField}
            <Field
              label="Password"
              htmlFor="sign-in-password"
              help={creating ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
              action={
                !creating && (
                  <button
                    type="button"
                    onClick={() => showView("forgot")}
                    disabled={busy}
                    className="text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text)] hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                )
              }
            >
              <PasswordInput
                id="sign-in-password"
                required
                minLength={creating ? MIN_PASSWORD_LENGTH : undefined}
                autoComplete={creating ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError();
                }}
                aria-invalid={error?.field === "password" || error?.field === "both" || undefined}
                aria-describedby={error ? "sign-in-error" : undefined}
              />
            </Field>
            {errorMessage}
            <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
              {creating
                ? status.kind === "sending" ? "Creating account…" : "Create account"
                : status.kind === "sending" ? "Signing in…" : "Sign in"}
            </Button>
            <p className="pt-1 text-center text-sm text-[color:var(--text-muted)]">
              {creating ? "Already have an account? " : "New to Toolio? "}
              <button
                type="button"
                onClick={() => {
                  setCreating(!creating);
                  setStatus({ kind: "idle" });
                }}
                className="font-medium text-[color:var(--accent-text)] hover:underline"
              >
                {creating ? "Sign in" : "Create an account"}
              </button>
            </p>
          </form>
        )}

      </div>
    </Dialog>
  );
}

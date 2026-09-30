"use client";

import { useState, type FormEvent } from "react";
import type { AuthError } from "@supabase/supabase-js";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import FormError from "@/components/ui/FormError";
import PasswordInput from "@/components/ui/PasswordInput";
import { MIN_PASSWORD_LENGTH, useAuth } from "@/lib/auth-context";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

function describeError(error: Pick<AuthError, "message" | "code">): string {
  switch (error.code) {
    case "same_password":
      return "That's already your password. Choose a different one.";
    case "reauthentication_needed":
      return "For your security, sign out and sign in again, then change your password.";
  }
  return error.message || "Couldn't save the password. Try again.";
}

/**
 * Sets or changes the signed-in user's password. Also where a "Forgot password?" reset link lands,
 * and how someone who signed up with an email link adds a password.
 */
export default function PasswordForm() {
  const { supabase } = useAuth();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setStatus({ kind: "saving" });
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setStatus({ kind: "error", message: describeError(error) });
    setPassword("");
    setStatus({ kind: "saved" });
  }

  return (
    <form onSubmit={save} className="max-w-sm space-y-3">
      <Field label="New password" htmlFor="new-password" help={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
        <PasswordInput
          id="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (status.kind !== "saving") setStatus({ kind: "idle" });
          }}
          aria-invalid={status.kind === "error" || undefined}
          aria-describedby={status.kind === "error" ? "password-error" : undefined}
        />
      </Field>
      {status.kind === "error" && <FormError id="password-error">{status.message}</FormError>}
      <Button type="submit" variant="primary" disabled={status.kind === "saving"}>
        {status.kind === "saving" ? "Saving…" : "Save password"}
      </Button>
      <p role="status" className="text-sm text-[color:var(--accent-text)]">
        {status.kind === "saved" && "Password saved. You can now sign in with your email and this password."}
      </p>
    </form>
  );
}

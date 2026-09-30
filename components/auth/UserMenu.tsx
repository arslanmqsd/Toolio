"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, LogOut } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";
import { useDismiss } from "@/lib/hooks/useDismiss";

const itemClass =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] focus-visible:bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] focus-visible:outline-none";

function Avatar({ user }: { user: User }) {
  // Set by Google sign-in. Display only; user_metadata is user-editable, so it never drives access.
  const url = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;
  const initial = (user.email ?? "?").charAt(0).toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote avatar host varies; next/image would need each host allow-listed.
    <img src={url} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent)] text-sm font-medium text-[color:var(--on-accent)]">
      {initial}
    </span>
  );
}

/** Avatar button in the nav with a dropdown: who is signed in, Dashboard, Sign out. */
export default function UserMenu({ user }: { user: User }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, button);

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setOpen(false);
  }

  return (
    <div
      ref={root}
      className="relative"
      onBlur={(event) => !root.current?.contains(event.relatedTarget as Node) && setOpen(false)}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${user.email ?? "your account"}`}
        onClick={() => setOpen(!open)}
        className="rounded-full ring-offset-2 ring-offset-[color:var(--surface)] hover:ring-2 hover:ring-[color:var(--border)]"
      >
        <Avatar user={user} />
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface-raised)] shadow-lg"
        >
          <p className="border-b border-[color:var(--border)] px-3 py-2.5 text-xs text-[color:var(--text-muted)]">
            Signed in as
            <span className="block truncate text-sm text-[color:var(--text)]">{user.email}</span>
          </p>
          <ul className="py-1">
            <li>
              <Link href="/dashboard" onClick={close} className={itemClass}>
                <LayoutDashboard aria-hidden className="h-4 w-4 text-[color:var(--text-muted)]" />
                Dashboard
              </Link>
            </li>
            <li>
              <button type="button" onClick={onSignOut} disabled={signingOut} className={`${itemClass} disabled:opacity-50`}>
                <LogOut aria-hidden className="h-4 w-4 text-[color:var(--text-muted)]" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

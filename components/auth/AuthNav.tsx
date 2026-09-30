"use client";

import { useAuth } from "@/lib/auth-context";
import SignInButton from "./SignInButton";
import UserMenu from "./UserMenu";

/** The nav's account slot: "Sign in" when signed out, the user menu when signed in. */
export default function AuthNav() {
  const { user, loading, enabled } = useAuth();
  if (!enabled) return null;
  // Same footprint as the button, so the nav doesn't shift once the session check finishes.
  if (loading) return <span aria-hidden className="inline-block h-8 w-[4.5rem]" />;
  return user ? <UserMenu user={user} /> : <SignInButton />;
}

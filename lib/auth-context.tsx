"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

interface AuthContextValue {
  /** The signed-in user, or null. For display only: the server re-checks the session for anything protected. */
  user: User | null;
  /** True until the first session check finishes, so the nav can avoid flashing "Sign in". */
  loading: boolean;
  /** False when Supabase isn't configured; sign-in is hidden then. */
  enabled: boolean;
  /** The Supabase browser client, or null when not configured. */
  supabase: SupabaseClient | null;
  signOut: () => Promise<void>;
}

/** Client-side floor for new passwords; the project's Auth settings may ask for more, and its error then shows. */
export const MIN_PASSWORD_LENGTH = 8;

const AuthContext = createContext<AuthContextValue | null>(null);

/** Tracks the Supabase session in the browser and shares the current user with the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const supabase = useMemo(() => (hasSupabaseEnv ? createClient() : null), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(supabase !== null);
  const userId = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    // Fires INITIAL_SESSION straight away, then on every sign-in, sign-out and token refresh, in all tabs.
    // Only set state here: awaiting other Supabase calls inside this callback can deadlock the client.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user ?? null;
      setUser(next);
      setLoading(false);
      // Re-render server components (e.g. the dashboard) when the signed-in account actually changes.
      if (event !== "INITIAL_SESSION" && (next?.id ?? null) !== userId.current) router.refresh();
      userId.current = next?.id ?? null;
    });
    return () => subscription.unsubscribe();
  }, [supabase, router]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, [supabase]);

  const value = useMemo(
    () => ({ user, loading, enabled: supabase !== null, supabase, signOut }),
    [user, loading, supabase, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}

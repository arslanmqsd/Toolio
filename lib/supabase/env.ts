/** Supabase project settings, read from NEXT_PUBLIC_* env vars (see .env.local.example). */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether Supabase is configured. The site works without it; accounts and sync are simply off. */
export const hasSupabaseEnv = Boolean(url && anonKey);

export function supabaseEnv(): { url: string; anonKey: string } {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.local.example).",
    );
  }
  return { url, anonKey };
}

/** Supabase project settings, read from NEXT_PUBLIC_* env vars (see .env.local.example). */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Publishable key (sb_publishable_...). The legacy anon key still works under its old name.
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether Supabase is configured. The site works without it; accounts and sync are simply off. */
export const hasSupabaseEnv = Boolean(url && key);

export function supabaseEnv(): { url: string; key: string } {
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.local.example).",
    );
  }
  return { url, key };
}

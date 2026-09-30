import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, supabaseEnv } from "./env";

/**
 * Refreshes the Supabase session on each request and writes the renewed auth cookies to both the
 * request (for Server Components rendering it) and the response (for the browser).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Nothing to refresh without Supabase configured, or for visitors who never signed in.
  const hasAuthCookie = request.cookies.getAll().some(({ name }) => name.startsWith("sb-"));
  if (!hasSupabaseEnv || !hasAuthCookie) return response;

  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Keeps CDNs from caching a response that carries one user's session cookies.
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Don't run code between createServerClient and this call: it validates the token and triggers the
  // refresh. getClaims verifies the JWT signature, unlike getSession.
  await supabase.auth.getClaims();

  return response;
}

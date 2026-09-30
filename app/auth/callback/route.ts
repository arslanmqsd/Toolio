import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Finishes sign-in and returns to `next`. Handles:
 * - `code`: Google, and magic links with Supabase's default email template (PKCE: same browser only).
 * - `token_hash` + `type`: magic links from a template that sends the token hash (works in any browser).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let failed = true;
  if (tokenHash && type) {
    const supabase = createClient();
    failed = Boolean((await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error);
  } else if (code) {
    const supabase = createClient();
    failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);
  }

  // Behind a proxy or load balancer, request.url is the internal host; send the browser back to the public one.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base = process.env.NODE_ENV !== "development" && forwardedHost ? `https://${forwardedHost}` : origin;
  return NextResponse.redirect(`${base}${failed ? "/auth/error" : next}`);
}

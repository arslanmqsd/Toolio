/**
 * Where to send someone after sign-in, taken from a `next` query param. Only same-site paths are allowed:
 * "//evil.com" and "/\evil.com" are protocol-relative URLs that browsers treat as another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/** The auth callback URL for this site, returning to `next` afterwards. Browser only. */
export function authCallbackUrl(next: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", safeNextPath(next));
  return url.toString();
}

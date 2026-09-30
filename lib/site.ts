export const SITE_NAME = "Toolio";

/**
 * Absolute origin used for canonical URLs, Open Graph and the sitemap. Set NEXT_PUBLIC_SITE_URL in
 * production; Vercel's production domain and localhost are fallbacks.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/+$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

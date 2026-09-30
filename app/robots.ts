import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/** Served at /robots.txt; points crawlers at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    // Account pages are per-user and have nothing to index.
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/auth/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

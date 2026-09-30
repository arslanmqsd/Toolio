import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/** Served at /robots.txt; points crawlers at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: absoluteUrl("/sitemap.xml") };
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { previewDocument, sanitizeHtml, sanitizePage } from "@/lib/html-preview";

/**
 * Styles for HTML with no styles of its own, like converted Markdown. The frame is a separate
 * document, so the app's CSS variables don't reach it; read their current values off the iframe
 * instead. Links stay underlined and code and tables keep borders, so nothing depends on colour
 * alone. The app's web fonts aren't loaded in the frame, so it uses the system ones.
 */
function proseCss(el: Element): string {
  const style = getComputedStyle(el);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const light = document.documentElement.dataset.theme === "light";
  return `
:root { color-scheme: ${light ? "light" : "dark"}; }
body { margin: 0; padding: 1rem; background: ${token("--surface", "Canvas")}; color: ${token("--text", "CanvasText")};
  font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; overflow-wrap: break-word; }
a { color: ${token("--accent-text", "LinkText")}; text-decoration: underline; }
h1, h2 { border-bottom: 1px solid ${token("--border", "GrayText")}; padding-bottom: .3em; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
:not(pre) > code { padding: .1em .35em; border: 1px solid ${token("--border", "GrayText")}; border-radius: 4px; background: ${token("--surface-raised", "Canvas")}; }
pre { padding: .75rem 1rem; overflow-x: auto; border: 1px solid ${token("--border", "GrayText")}; border-radius: 6px; background: ${token("--surface-raised", "Canvas")}; }
blockquote { margin-left: 0; padding-left: 1rem; border-left: 4px solid ${token("--border", "GrayText")}; color: ${token("--text-muted", "GrayText")}; }
table { border-collapse: collapse; display: block; max-width: 100%; overflow-x: auto; }
th, td { border: 1px solid ${token("--border", "GrayText")}; padding: .35rem .75rem; }
th { font-weight: 600; }
hr { border: 0; border-top: 1px solid ${token("--border", "GrayText")}; }
img { max-width: 100%; }
li:has(> input[type="checkbox"]) { list-style: none; }
`;
}

/** A page's own styles decide how it looks; this is only what a browser shows a page without any. */
const PAGE_CSS = ":root { color-scheme: light; } body { background: #fff; color: #000; }";

/** Re-renders when the site theme changes, so the preview's colours follow it. */
function useThemeVersion(enabled: boolean): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const observer = new MutationObserver(() => setVersion((v) => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    return () => observer.disconnect();
  }, [enabled]);
  return version;
}

interface HtmlPreviewProps {
  html: string;
  /**
   * "prose" styles bare HTML (converted Markdown) to match the app. "page" renders a web page with
   * its own <style>s and body attributes, on white like a browser would.
   */
  styling: "prose" | "page";
  /** Frame width in CSS pixels, to see a page at a phone's width; fills the space when unset. */
  width?: number;
  className?: string;
}

/**
 * Renders HTML that may be hostile. Three layers: DOMPurify strips scripts, handlers and javascript:
 * links; the sandbox has no allow-scripts, allow-same-origin or allow-forms, so anything that slips
 * through can't run, reach the app or submit; and the CSP blocks scripts again and fetches nothing
 * but images. allow-popups lets links open in a new tab instead of doing nothing.
 */
export default function HtmlPreview({ html, styling, width, className = "" }: HtmlPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const themeVersion = useThemeVersion(styling === "prose");
  const [css, setCss] = useState(styling === "page" ? PAGE_CSS : "");

  const srcDoc = useMemo(() => {
    if (!css) return undefined;
    if (styling === "prose") return previewDocument(sanitizeHtml(html), css);
    const page = sanitizePage(html);
    return previewDocument(page.body, css, page.bodyAttributes);
  }, [html, css, styling]);

  useEffect(() => {
    if (styling === "page") setCss(PAGE_CSS);
    else if (frameRef.current) setCss(proseCss(frameRef.current));
  }, [themeVersion, styling]);

  return (
    <iframe
      ref={frameRef}
      title="Rendered HTML preview"
      aria-label="Rendered HTML preview, sanitized"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={width ? { width, maxWidth: "none" } : undefined}
      className={`h-[32rem] max-h-[70vh] w-full shrink-0 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] ${className}`}
    />
  );
}

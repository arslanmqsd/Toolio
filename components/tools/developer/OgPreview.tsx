"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import CodeBlock from "@/components/ui/CodeBlock";
import {
  DESCRIPTION_LIMIT,
  EMPTY_TAGS,
  TITLE_LIMIT,
  checkTags,
  generateTags,
  isAbsoluteUrl,
  parseMetaTags,
  resolveTags,
  type ImageInfo,
  type MetaTags,
} from "@/lib/tools/developer/meta-tags";
import { DiscordPreview, FacebookPreview, GooglePreview, LinkedInPreview, SlackPreview, XPreview } from "./og-preview/Previews";

const EXAMPLE_TAGS: MetaTags = {
  ...EMPTY_TAGS,
  title: "Free Online Developer Tools | Toolio",
  description: "Format JSON, decode JWTs, test regex and more. Fast, private tools that run in your browser.",
  canonical: "https://toolio.dev/",
  ogTitle: "Toolio: free online developer tools",
  ogDescription: "Format JSON, decode JWTs, test regex and more. Fast, private tools that run in your browser.",
  // Filled in with this site's own sample image once mounted.
  ogImage: "",
  ogImageAlt: "The Toolio name on a blue background",
  ogUrl: "https://toolio.dev/",
  ogSiteName: "Toolio",
  ogType: "website",
  twitterCard: "summary_large_image",
  themeColor: "#2F6690",
};

// Built from the tags, so the first render needs no DOM parser and matches on server and client.
const EXAMPLE_HTML = generateTags(EXAMPLE_TAGS);
const EXAMPLE_IMAGE_PATH = "/og-example.png";

const MODES = [
  { id: "html", label: "Paste HTML" },
  { id: "edit", label: "Edit tags" },
] as const;

type Mode = (typeof MODES)[number]["id"];

interface FieldSpec {
  key: keyof MetaTags;
  label: string;
  help?: string;
  placeholder?: (t: MetaTags) => string;
  multiline?: boolean;
  limit?: number;
}

const BASICS: FieldSpec[] = [
  { key: "title", label: "Page title", help: "<title>, shown in search results and browser tabs.", limit: TITLE_LIMIT },
  { key: "description", label: "Description", help: '<meta name="description">', multiline: true, limit: DESCRIPTION_LIMIT },
  { key: "ogUrl", label: "Page URL", help: "og:url, also written as the canonical link.", placeholder: (t) => t.canonical || "https://example.com/page" },
  { key: "ogImage", label: "Image URL", help: "og:image. 1200×630 works everywhere.", placeholder: () => "https://example.com/og.png" },
  { key: "ogImageAlt", label: "Image description", help: "og:image:alt, read out by screen readers." },
  { key: "ogSiteName", label: "Site name", help: "og:site_name" },
];

const OVERRIDES: FieldSpec[] = [
  { key: "ogTitle", label: "og:title", placeholder: (t) => t.title, limit: TITLE_LIMIT },
  { key: "ogDescription", label: "og:description", placeholder: (t) => t.description, multiline: true },
  { key: "twitterTitle", label: "twitter:title", placeholder: (t) => t.ogTitle || t.title },
  { key: "twitterDescription", label: "twitter:description", placeholder: (t) => t.ogDescription || t.description, multiline: true },
  { key: "twitterImage", label: "twitter:image", placeholder: (t) => t.ogImage },
  { key: "twitterSite", label: "twitter:site", placeholder: () => "@yourbrand" },
  { key: "themeColor", label: "theme-color", help: "Discord's embed stripe and some mobile browsers.", placeholder: () => "#2F6690" },
];

/** Loads the image to read its size, or notes that it failed. Null while there's nothing to load. */
function useImageInfo(url: string): ImageInfo {
  const [info, setInfo] = useState<{ url: string; info: ImageInfo }>({ url: "", info: null });
  useEffect(() => {
    if (!isAbsoluteUrl(url)) return;
    let live = true;
    const img = new window.Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => live && setInfo({ url, info: { width: img.naturalWidth, height: img.naturalHeight } });
    img.onerror = () => live && setInfo({ url, info: "error" });
    img.src = url;
    return () => {
      live = false;
    };
  }, [url]);
  return info.url === url ? info.info : null;
}

export default function OgPreview() {
  const [mode, setMode] = useState<Mode>("html");
  const [tags, setTags] = useState<MetaTags>(EXAMPLE_TAGS);
  const [found, setFound] = useState<number | null>(null);
  const [editedSincePaste, setEditedSincePaste] = useState(false);

  function readHtml(value: string) {
    const parsed = parseMetaTags(value);
    setTags(parsed.tags);
    setFound(parsed.found);
    setEditedSincePaste(false);
  }

  const [html, setHtml] = useToolInput(EXAMPLE_HTML, (value) => {
    setMode("html");
    readHtml(value);
  });

  // The sample image needs this site's address, which only the browser knows for sure; fill it in
  // after the first render so server and client render the same, and only while the example is untouched.
  useEffect(() => {
    const image = `${window.location.origin}${EXAMPLE_IMAGE_PATH}`;
    const withImage = { ...EXAMPLE_TAGS, ogImage: image };
    setTags((t) => (t === EXAMPLE_TAGS ? withImage : t));
    setHtml((h) => (h === EXAMPLE_HTML ? generateTags(withImage) : h));
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTag(key: keyof MetaTags, value: string) {
    setTags((t) => ({ ...t, [key]: value }));
    setEditedSincePaste(true);
  }

  const resolved = useMemo(() => resolveTags(tags), [tags]);
  const imageInfo = useImageInfo(resolved.image);
  const checks = useMemo(() => checkTags(tags, imageInfo), [tags, imageInfo]);
  const generated = useMemo(() => generateTags(tags), [tags]);
  const errors = checks.filter((c) => c.level === "error").length;

  function renderField(spec: FieldSpec) {
    const id = `og-${spec.key}`;
    const value = tags[spec.key];
    const props = {
      id,
      value,
      placeholder: spec.placeholder?.(tags),
      onChange: (e: { target: { value: string } }) => setTag(spec.key, e.target.value),
    };
    const count = spec.limit && value ? (
      <span className={`text-xs tabular-nums ${value.length > spec.limit ? "text-[color:var(--accent-warn-text)]" : "text-[color:var(--text-muted)]"}`}>
        {value.length}/{spec.limit}
      </span>
    ) : undefined;
    return (
      <Field key={spec.key} label={spec.label} htmlFor={id} help={spec.help} action={count}>
        {spec.multiline ? <CodeTextArea {...props} rows={2} spellCheck /> : <CodeInput {...props} />}
      </Field>
    );
  }

  return (
    <>
      <InputPanel label="Tags">
        <div className="space-y-5">
          <SegmentedControl label="Input" options={MODES} value={mode} onChange={setMode} variant="tabs" />

          {mode === "html" ? (
            <div className="space-y-3">
              <CodeTextArea
                aria-label="Page HTML or meta tags"
                value={html}
                onChange={(e) => {
                  setHtml(e.target.value);
                  readHtml(e.target.value);
                }}
                rows={16}
              />
              <p className="text-xs text-[color:var(--text-muted)]">
                Paste a page&rsquo;s source (View Source in your browser) or just its &lt;meta&gt; tags. Nothing is fetched or sent anywhere.
              </p>
              {found === 0 && html.trim() && (
                <p className="text-xs text-[color:var(--accent-warn-text)]">No title, meta or link tags found. Paste the page&rsquo;s HTML source.</p>
              )}
              {editedSincePaste && (
                <p className="text-xs text-[color:var(--text-muted)]">You&rsquo;ve edited the tags since pasting. The previews show your edits.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {BASICS.map(renderField)}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type" htmlFor="og-type" help="og:type">
                  <Select id="og-type" value={tags.ogType || "website"} onChange={(e) => setTag("ogType", e.target.value)}>
                    <option value="website">website</option>
                    <option value="article">article</option>
                    <option value="product">product</option>
                    <option value="profile">profile</option>
                  </Select>
                </Field>
                <Field label="X card" htmlFor="og-twitter-card" help="twitter:card">
                  <Select id="og-twitter-card" value={tags.twitterCard || "summary"} onChange={(e) => setTag("twitterCard", e.target.value)}>
                    <option value="summary_large_image">Large image</option>
                    <option value="summary">Small image</option>
                  </Select>
                </Field>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">Per-platform overrides</summary>
                <p className="mt-2 text-xs text-[color:var(--text-muted)]">Leave blank to fall back to the field shown in grey.</p>
                <div className="mt-3 space-y-4">{OVERRIDES.map(renderField)}</div>
              </details>
            </div>
          )}
        </div>
      </InputPanel>

      <OutputPanel label="Previews" copyText={generated} outputType="html" download={{ filename: "meta-tags.html", mimeType: "text/html" }}>
        <div className="space-y-8 font-[family-name:var(--font-ui)]">
          <section aria-labelledby="og-checks">
            <h2 id="og-checks" className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {checks.length === 0 ? (
                <>
                  <CheckCircle2 aria-hidden className="h-4 w-4 text-[color:var(--accent-text)]" /> All checks passed
                </>
              ) : (
                <>
                  {errors ? <XCircle aria-hidden className="h-4 w-4 text-[color:var(--error)]" /> : <AlertTriangle aria-hidden className="h-4 w-4 text-[color:var(--accent-warn-text)]" />}
                  {[errors && `${errors} ${errors === 1 ? "problem" : "problems"}`, checks.length - errors && `${checks.length - errors} to check`].filter(Boolean).join(", ")}
                </>
              )}
            </h2>
            {checks.length > 0 && (
              <ul className="space-y-1.5 text-xs">
                {checks.map((c) => (
                  <li key={c.message} className="flex gap-2">
                    {c.level === "error" ? (
                      <XCircle aria-label="Problem" className="mt-px h-3.5 w-3.5 shrink-0 text-[color:var(--error)]" />
                    ) : (
                      <AlertTriangle aria-label="Check" className="mt-px h-3.5 w-3.5 shrink-0 text-[color:var(--accent-warn-text)]" />
                    )}
                    <span>{c.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {imageInfo && imageInfo !== "error" && (
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                Image: {imageInfo.width}×{imageInfo.height}
              </p>
            )}
          </section>

          <GooglePreview r={resolved} />
          <FacebookPreview r={resolved} />
          <XPreview r={resolved} />
          <LinkedInPreview r={resolved} />
          <SlackPreview r={resolved} />
          <DiscordPreview r={resolved} />

          <p className="text-xs text-[color:var(--text-muted)]">
            Previews are close approximations. Platforms change their layouts and cache cards, so a page shared before may keep its old card for a while.
          </p>

          <section aria-labelledby="og-generated">
            <h2 id="og-generated" className="mb-2 text-sm font-semibold">
              Tags for your &lt;head&gt;
            </h2>
            <div className="rounded-md border border-[color:var(--border)] p-3 font-[family-name:var(--font-mono)] text-xs">
              <CodeBlock code={generated} wrap />
            </div>
          </section>
        </div>
      </OutputPanel>
    </>
  );
}

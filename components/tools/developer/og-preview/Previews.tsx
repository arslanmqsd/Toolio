import type { ReactNode } from "react";
import type { Resolved } from "@/lib/tools/developer/meta-tags";

/**
 * Approximations of how a shared link looks on each platform: their layout, truncation and image
 * crop, drawn in the site's own colours so they read in light and dark themes.
 */

const muted = "text-[color:var(--text-muted)]";
const link = "text-[color:var(--accent-text)]";

function Image({ src, alt, className }: { src: string; alt: string; className: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- an arbitrary external URL, shown as given.
  return <img src={src} alt={alt} referrerPolicy="no-referrer" loading="lazy" className={`block bg-[color:var(--border)] object-cover ${className}`} />;
}

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <figure className="space-y-2">
      <figcaption className={`text-xs font-medium ${muted}`}>{name}</figcaption>
      {children}
    </figure>
  );
}

const fallbackDomain = (r: Resolved) => r.domain || "example.com";

export function GooglePreview({ r }: { r: Resolved }) {
  return (
    <Frame name="Google search">
      <div className="max-w-[600px] font-[family-name:var(--font-ui)]">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full border border-[color:var(--border)] text-xs">
            {(r.siteName || fallbackDomain(r)).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm">{r.siteName || fallbackDomain(r)}</div>
            <div className={`truncate text-xs ${muted}`}>{r.url || `https://${fallbackDomain(r)}`}</div>
          </div>
        </div>
        <div className={`mt-1 truncate text-xl ${link}`}>{r.pageTitle || "Untitled page"}</div>
        <p className={`line-clamp-2 text-sm ${muted}`}>{r.description || "No description: Google picks text from the page."}</p>
      </div>
    </Frame>
  );
}

export function FacebookPreview({ r }: { r: Resolved }) {
  return (
    <Frame name="Facebook">
      <div className="max-w-[500px] overflow-hidden rounded-md border border-[color:var(--border)] font-[family-name:var(--font-ui)]">
        <Image src={r.image} alt={r.imageAlt} className="aspect-[1.91/1] w-full" />
        <div className="bg-[color:var(--surface-raised)] px-3 py-2">
          <div className={`truncate text-xs uppercase ${muted}`}>{fallbackDomain(r)}</div>
          <div className="line-clamp-2 font-semibold">{r.title || fallbackDomain(r)}</div>
          {r.description && <p className={`line-clamp-1 text-sm ${muted}`}>{r.description}</p>}
        </div>
      </div>
    </Frame>
  );
}

export function XPreview({ r }: { r: Resolved }) {
  const { x } = r;
  if (x.card === "summary_large_image" && x.image) {
    return (
      <Frame name="X (large card)">
        <div className="max-w-[500px] font-[family-name:var(--font-ui)]">
          <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border)]">
            <Image src={x.image} alt={r.imageAlt} className="aspect-[1.91/1] w-full" />
            <span className="absolute bottom-3 left-3 max-w-[85%] truncate rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{x.title || fallbackDomain(r)}</span>
          </div>
          <div className={`mt-1 text-xs ${muted}`}>From {fallbackDomain(r)}</div>
        </div>
      </Frame>
    );
  }
  return (
    <Frame name="X (small card)">
      <div className="flex max-w-[500px] overflow-hidden rounded-2xl border border-[color:var(--border)] font-[family-name:var(--font-ui)]">
        {x.image ? (
          <Image src={x.image} alt={r.imageAlt} className="aspect-square w-[130px] shrink-0 border-r border-[color:var(--border)]" />
        ) : (
          <div aria-hidden className={`grid aspect-square w-[130px] shrink-0 place-items-center border-r border-[color:var(--border)] text-2xl ${muted}`}>
            ▤
          </div>
        )}
        <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 text-sm">
          <div className={`truncate ${muted}`}>{fallbackDomain(r)}</div>
          <div className="truncate">{x.title || fallbackDomain(r)}</div>
          {x.description && <p className={`line-clamp-2 ${muted}`}>{x.description}</p>}
        </div>
      </div>
    </Frame>
  );
}

export function LinkedInPreview({ r }: { r: Resolved }) {
  return (
    <Frame name="LinkedIn">
      <div className="max-w-[550px] overflow-hidden rounded-md border border-[color:var(--border)] font-[family-name:var(--font-ui)]">
        <Image src={r.image} alt={r.imageAlt} className="aspect-[1.91/1] w-full" />
        <div className="bg-[color:var(--surface-raised)] px-3 py-2">
          <div className="line-clamp-2 text-sm font-semibold">{r.title || fallbackDomain(r)}</div>
          <div className={`truncate text-xs ${muted}`}>{fallbackDomain(r)}</div>
        </div>
      </div>
    </Frame>
  );
}

export function SlackPreview({ r }: { r: Resolved }) {
  return (
    <Frame name="Slack">
      <div className="flex max-w-[500px] gap-3 font-[family-name:var(--font-ui)] text-sm">
        <div aria-hidden className="w-1 shrink-0 rounded-full bg-[color:var(--border)]" />
        <div className="min-w-0 space-y-0.5">
          <div className="font-semibold">{r.siteName || fallbackDomain(r)}</div>
          <div className={`font-semibold ${link}`}>{r.title || r.url || fallbackDomain(r)}</div>
          {r.description && <p className="line-clamp-3">{r.description}</p>}
          <Image src={r.image} alt={r.imageAlt} className="mt-2 max-h-[200px] w-auto max-w-[360px] rounded-md object-contain" />
        </div>
      </div>
    </Frame>
  );
}

export function DiscordPreview({ r }: { r: Resolved }) {
  return (
    <Frame name="Discord">
      <div
        className="max-w-[432px] rounded border-l-4 bg-[color:var(--surface-raised)] p-3 font-[family-name:var(--font-ui)] text-sm"
        style={{ borderLeftColor: r.themeColor || "var(--border)" }}
      >
        {r.siteName && <div className={`text-xs ${muted}`}>{r.siteName}</div>}
        <div className={`font-semibold ${link}`}>{r.title || fallbackDomain(r)}</div>
        {r.description && <p className="mt-1 line-clamp-3">{r.description}</p>}
        <Image src={r.image} alt={r.imageAlt} className="mt-3 aspect-[1.91/1] w-full rounded" />
      </div>
    </Frame>
  );
}

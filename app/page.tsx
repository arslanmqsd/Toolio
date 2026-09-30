import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, Lock, Monitor, ShieldCheck, Sparkles, UserX, Zap, HardDrive, History } from "lucide-react";
import HomeSearch from "@/components/home/HomeSearch";
import RecentTools from "@/components/home/RecentTools";
import ToolFinder from "@/components/home/ToolFinder";
import CategoryDot from "@/components/catalog/CategoryDot";
import { IconTile } from "@/components/catalog/icons";
import { tintColor } from "@/lib/category-theme-css";
import ToolCard from "@/components/catalog/ToolCard";
import { buttonClass } from "@/components/ui/Button";
import { categories, allTools, plannedTools, toolHref } from "@/registry";

const POPULAR_COUNT = 6;

const HERO_POINTS = [
  { icon: Zap, label: "Instant results" },
  { icon: ShieldCheck, label: "Runs in your browser" },
  { icon: Lock, label: "No sign-up needed" },
];

// Keep these true: every current tool runs client-side and there is no backend.
// Revisit when a tool starts processing data on a server.
const PRIVACY_POINTS = [
  { icon: Monitor, title: "Runs in your browser", body: "What you paste is processed on your device." },
  { icon: HardDrive, title: "Nothing kept on our side", body: "We don't store the data you work with." },
  { icon: UserX, title: "No account needed", body: "Use every tool without signing up." },
  { icon: History, title: "History stays local", body: "Recently used tools are saved in your browser only." },
];

function SectionHeader({ id, title, href, linkLabel }: { id: string; title: string; href: string; linkLabel: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 id={id} className="text-2xl font-semibold tracking-[-0.02em]">
        {title}
      </h2>
      <Link href={href} className="flex shrink-0 items-center gap-1 text-sm text-[color:var(--accent-text)] hover:underline">
        {linkLabel}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
    </div>
  );
}

export default function Home() {
  const popular = [
    ...allTools.map((tool) => ({ ...tool, href: toolHref(tool) })),
    ...plannedTools.map((tool) => ({ ...tool, href: undefined })),
  ].slice(0, POPULAR_COUNT);

  return (
    <main>
      <section className="bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)] px-4 pb-20 pt-16 text-center sm:pt-24">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-raised)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
          <Sparkles aria-hidden className="h-3.5 w-3.5 text-[color:var(--accent-text)]" />
          Your all-in-one toolbox
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-[2.5rem] font-bold leading-[1.08] tracking-[-0.035em] sm:text-6xl">
          Small tools.
          <br />
          <span className="text-[color:var(--accent-text)]">Big time savings.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[color:var(--text-muted)] sm:text-lg">
          Convert, generate, clean, calculate, compare, and transform, all in one place.
        </p>
        <div className="mt-9">
          <HomeSearch />
        </div>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-[color:var(--text-muted)]">
          {HERO_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-1.5">
              <Icon aria-hidden className="h-4 w-4" />
              {label}
            </li>
          ))}
        </ul>
        <RecentTools />
      </section>

      <div className="mx-auto max-w-6xl space-y-20 px-4 pb-20">
        <section aria-labelledby="popular-heading">
          <SectionHeader id="popular-heading" title="Popular tools" href="/tools" linkLabel="View all tools" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((tool) => (
              <li key={tool.id}>
                <ToolCard {...tool} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="categories-heading" id="categories" className="scroll-mt-20">
          <SectionHeader
            id="categories-heading"
            title="Everything you need, organized."
            href="/tools"
            linkLabel="View all categories"
          />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(categories).map((category) => {
              const count = allTools.filter((tool) => tool.category === category.id).length;
              return (
                <li key={category.id}>
                  <Link
                    href={`/tools/${category.id}`}
                    style={{ "--card-tint": tintColor(category.id) } as CSSProperties}
                    className="flex h-full gap-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-5 transition-colors hover:border-[color:var(--card-tint)]"
                  >
                    <IconTile category={category.id} />
                    <span>
                      <span className="block font-semibold">{category.label}</span>
                      <span className="flex items-center gap-1.5 text-xs text-[color:var(--text-muted)]">
                        <CategoryDot category={category.id} />
                        {count > 0 ? `${count} ${count === 1 ? "tool" : "tools"}` : "Coming soon"}
                      </span>
                      <span className="mt-2 block text-sm text-[color:var(--text-muted)]">{category.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <ToolFinder />

        <section aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="mb-6 flex items-center gap-2 text-2xl font-semibold tracking-[-0.02em]">
            <Lock aria-hidden className="h-6 w-6" />
            Your data stays with you.
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PRIVACY_POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent-text)]" />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-0.5 block text-sm text-[color:var(--text-muted)]">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-[color:color-mix(in_srgb,var(--accent)_22%,var(--bg))] px-6 py-12 text-center text-white">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Ready to get things done?</h2>
          <p className="mt-2 text-white/75">Pick a tool and start in seconds. No sign-up.</p>
          <Link
            href="/tools"
            className={`mt-6 ${buttonClass({ variant: "primary", size: "lg" })}`}
          >
            Explore tools
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </main>
  );
}

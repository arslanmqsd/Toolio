import Link from "next/link";
import { ArrowRight, Lock, Monitor, UserX, HardDrive, History } from "lucide-react";
import HomeSearch from "@/components/home/HomeSearch";
import RecentTools from "@/components/home/RecentTools";
import ToolFinder from "@/components/home/ToolFinder";
import CategoryDot from "@/components/catalog/CategoryDot";
import ToolCard from "@/components/catalog/ToolCard";
import { categories, allTools, plannedTools, toolHref } from "@/registry";

const POPULAR_COUNT = 6;

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
      {/* Search first, the full directory beside it: the page is a way into the tools, not a pitch. */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <div>
          <h1 className="max-w-xl text-[2.5rem] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[3.25rem]">{allTools.length} tools that run in your browser.</h1>
          <p className="mt-5 max-w-lg text-[color:var(--text-muted)] sm:text-lg">
            Format JSON, decode a JWT, sign or merge a PDF, clean a CSV. What you paste stays on your device, and there&apos;s nothing to sign up for.
          </p>
          <div className="mt-8">
            <HomeSearch />
          </div>
          <RecentTools />
        </div>

        <nav aria-labelledby="categories-heading" id="categories" className="scroll-mt-20">
          <h2 id="categories-heading" className="mb-2 text-sm text-[color:var(--text-muted)]">
            Browse by category
          </h2>
          <ul className="divide-y divide-[color:var(--border)] border-y border-[color:var(--border)]">
            {Object.values(categories).map((category) => {
              const count = allTools.filter((tool) => tool.category === category.id).length;
              return (
                <li key={category.id}>
                  <Link href={`/tools/${category.id}`} className="group flex items-baseline gap-3 py-3">
                    <CategoryDot category={category.id} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium group-hover:text-[color:var(--accent-text)] group-hover:underline">{category.label}</span>
                      <span className="block truncate text-sm text-[color:var(--text-muted)]">{category.description}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-[color:var(--text-muted)]">{count > 0 ? count : "Soon"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
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
      </div>
    </main>
  );
}

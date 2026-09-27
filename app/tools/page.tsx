import type { Metadata } from "next";
import Link from "next/link";
import CategoryTools from "@/components/catalog/CategoryTools";
import { IconTile } from "@/components/catalog/icons";
import { categories } from "@/registry";

export const metadata: Metadata = {
  title: "All tools | Toolio",
  description: "Every Toolio tool, grouped by category.",
};

export default function AllToolsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-bold tracking-[-0.03em]">All tools</h1>
      <div className="mt-12 space-y-14">
        {Object.values(categories).map((category) => (
          <section key={category.id} aria-labelledby={`cat-${category.id}`}>
            <Link href={`/tools/${category.id}`} className="mb-5 flex items-center gap-3 hover:underline">
              <IconTile category={category.id} size="sm" />
              <h2 id={`cat-${category.id}`} className="text-xl font-semibold">
                {category.label}
              </h2>
            </Link>
            <CategoryTools category={category.id} />
          </section>
        ))}
      </div>
    </main>
  );
}

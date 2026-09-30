import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CategoryTools from "@/components/catalog/CategoryTools";
import { IconTile } from "@/components/catalog/icons";
import { categories, type CategoryId } from "@/registry";

interface CategoryPageProps {
  params: { category: string };
}

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(categories).map((category) => ({ category }));
}

function getCategory(id: string) {
  return Object.hasOwn(categories, id) ? categories[id as CategoryId] : undefined;
}

export function generateMetadata({ params }: CategoryPageProps): Metadata {
  const category = getCategory(params.category);
  return category ? { title: `${category.label} tools`, description: category.description, alternates: { canonical: `/tools/${category.id}` } } : {};
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const category = getCategory(params.category);
  if (!category) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex items-center gap-4">
        <IconTile category={category.id} />
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.03em]">{category.label}</h1>
          <p className="mt-1 text-[color:var(--text-muted)]">{category.description}</p>
        </div>
      </div>
      <div className="mt-10">
        <CategoryTools category={category.id} />
      </div>
    </main>
  );
}

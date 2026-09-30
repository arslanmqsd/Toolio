import { tintColor } from "@/lib/category-theme-css";
import type { CategoryId } from "@/registry";

/** Small dot in a category's tint, marking which category a label or count belongs to. Decorative. */
export default function CategoryDot({ category }: { category: CategoryId }) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: tintColor(category) }}
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
    />
  );
}

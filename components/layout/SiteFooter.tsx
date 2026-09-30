import Link from "next/link";
import Logo from "@/components/layout/Logo";
import { categories } from "@/registry";

export default function SiteFooter() {
  return (
    <footer data-brand className="border-t border-[color:var(--border)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:flex-row sm:justify-between">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">The toolbox for everything.</p>
        </div>
        <nav aria-label="Tool categories">
          <h2 className="mb-3 text-sm font-semibold">Tools</h2>
          <ul className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-[color:var(--text-muted)]">
            {Object.values(categories).map((category) => (
              <li key={category.id}>
                <Link href={`/tools/${category.id}`} className="hover:text-[color:var(--text)]">
                  {category.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-[color:var(--text-muted)]">
        © {new Date().getFullYear()} Toolio
      </p>
    </footer>
  );
}

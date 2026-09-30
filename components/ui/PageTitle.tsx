import type { ReactNode } from "react";

/**
 * The h1 of catalog and tool pages. Deliberately understated: UI chrome stays quiet so the monospace
 * tool output carries the personality. Uses --font-display so a category can restyle its headings.
 */
export default function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.01em] sm:text-[1.75rem]">
      {children}
    </h1>
  );
}

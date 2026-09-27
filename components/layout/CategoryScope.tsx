"use client";

import type { ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";

// Root layout wrapper. Exposes the current tool category as data-category so
// globals.css can override tokens (--accent, --font-display) per category.
export default function CategoryScope({ children }: { children: ReactNode }) {
  const segments = useSelectedLayoutSegments();
  const category = segments[0] === "tools" ? segments[1] : undefined;

  return (
    <div data-category={category} className="min-h-screen">
      {children}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A URL query parameter as state. Setting it pushes a history entry, so browser Back undoes it. Read after mount:
 * tool pages are static, and useSearchParams would need a Suspense boundary.
 */
export function useQueryParam(name: string): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setValue(new URLSearchParams(window.location.search).get(name));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [name]);

  const set = useCallback(
    (next: string | null) => {
      const url = new URL(window.location.href);
      if (next === null) url.searchParams.delete(name);
      else url.searchParams.set(name, next);
      window.history.pushState(null, "", url);
      setValue(next);
    },
    [name],
  );

  return [value, set];
}

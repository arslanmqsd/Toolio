"use client";

import { useCallback, useEffect, useState } from "react";
import type { LanguageFn } from "highlight.js";
import { parseHighlighted, plainPieces, type Highlight } from "@/lib/tools/developer/diff/highlight";
import type { LanguageId } from "@/lib/tools/developer/diff/language";

const LOADERS: Record<LanguageId, () => Promise<{ default: LanguageFn }>> = {
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  json: () => import("highlight.js/lib/languages/json"),
  css: () => import("highlight.js/lib/languages/css"),
  xml: () => import("highlight.js/lib/languages/xml"),
  python: () => import("highlight.js/lib/languages/python"),
  go: () => import("highlight.js/lib/languages/go"),
  sql: () => import("highlight.js/lib/languages/sql"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  bash: () => import("highlight.js/lib/languages/bash"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
};

async function load(languages: LanguageId[]): Promise<[LanguageId, Highlight][]> {
  const hljs = (await import("highlight.js/lib/core")).default;
  const modules = await Promise.all(languages.map((language) => LOADERS[language]()));
  return languages.map((language, i) => {
    if (!hljs.getLanguage(language)) hljs.registerLanguage(language, modules[i].default);
    const highlight: Highlight = (code) => {
      try {
        return parseHighlighted(hljs.highlight(code, { language, ignoreIllegals: true }).value);
      } catch {
        return plainPieces(code);
      }
    };
    return [language, highlight];
  });
}

/**
 * Loads highlight.js and the given languages on demand (nothing loads for plain text). Returns a lookup that
 * gives null until a language is ready, so rows render plain first and gain colors without shifting.
 */
export function useHighlighters(languages: readonly LanguageId[]): (language: LanguageId | null) => Highlight | null {
  const [ready, setReady] = useState<ReadonlyMap<LanguageId, Highlight>>(new Map());
  const wanted = [...new Set(languages)].sort().join(",");

  useEffect(() => {
    const missing = (wanted ? wanted.split(",") : []).filter((l) => !ready.has(l as LanguageId)) as LanguageId[];
    if (missing.length === 0) return;
    let cancelled = false;
    load(missing)
      .then((loaded) => !cancelled && setReady((prev) => new Map([...prev, ...loaded])))
      // A failed chunk load leaves the diff uncolored, which is still correct.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // `ready` is read, not watched: watching it would re-run after every load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  return useCallback((language) => (language ? (ready.get(language) ?? null) : null), [ready]);
}

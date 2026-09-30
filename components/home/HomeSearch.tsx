"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { IconTile } from "@/components/catalog/icons";
import Button from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { categories, toolHref } from "@/registry";
import { search } from "@/lib/search/search";
import { consumeSearchFocus, SEARCH_INPUT_ID } from "@/lib/search/search-focus";

const PLACEHOLDERS = [
  "convert JSON to TypeScript",
  "decode a JWT",
  "format messy SQL",
  "generate a UUID",
];
const CYCLE_MS = 3000;
const TYPE_MS = 45;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Cycles through PLACEHOLDERS, typing each one out. Stops while `paused`. */
function useCyclingPlaceholder(paused: boolean): string {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(PLACEHOLDERS[0].length);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % PLACEHOLDERS.length), CYCLE_MS);
    return () => clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    const full = PLACEHOLDERS[index].length;
    if (reducedMotion) {
      setTyped(full);
      return;
    }
    setTyped(0);
    const timer = setInterval(() => {
      setTyped((n) => {
        if (n + 1 >= full) clearInterval(timer);
        return Math.min(n + 1, full);
      });
    }, TYPE_MS);
    return () => clearInterval(timer);
  }, [index, reducedMotion]);

  return PLACEHOLDERS[index].slice(0, typed);
}

function useShortcutLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K");
  }, []);
  return label;
}

export default function HomeSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const placeholder = useCyclingPlaceholder(query !== "");
  const shortcut = useShortcutLabel();

  const results = useMemo(() => search(query), [query]);
  const hasQuery = query.trim() !== "";

  useEffect(() => {
    if (consumeSearchFocus()) inputRef.current?.focus();
  }, []);

  useEffect(() => setActive(0), [query]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      openActive();
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  function openActive() {
    const target = results[active];
    if (target) router.push(toolHref(target.tool));
    else inputRef.current?.focus();
  }

  return (
    <div className="relative mx-auto max-w-2xl text-left">
      <div className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-1.5 pl-4 transition-colors focus-within:border-[color:var(--accent)]">
        <Search aria-hidden className="h-5 w-5 shrink-0 text-[color:var(--text-muted)]" />
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            id={SEARCH_INPUT_ID}
            type="text"
            role="combobox"
            aria-label="Search tools"
            aria-expanded={hasQuery}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={hasQuery && results[active] ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent py-2.5 text-base outline-none sm:text-[17px]"
          />
          {query === "" && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap text-base text-[color:var(--text-muted)] sm:text-[17px]"
            >
              Try &ldquo;{placeholder}
              <span className="caret mx-px inline-block h-[1.1em] w-[2px] bg-[color:var(--accent-text)]" />
              &rdquo;
            </span>
          )}
        </div>
        {shortcut && (
          <kbd className="pointer-events-none hidden shrink-0 rounded border border-[color:var(--border)] px-1.5 py-0.5 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)] sm:block">
            {shortcut}
          </kbd>
        )}
        <Button variant="primary" size="lg" onClick={openActive} className="shrink-0">
          Search
        </Button>
      </div>

      {hasQuery && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-raised)]">
          {results.length === 0 ? (
            <p className="px-5 py-4 text-sm text-[color:var(--text-muted)]">
              No tool does that yet. Try describing it another way, or browse the categories below.
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Matching tools" className="p-1.5">
              {results.map(({ tool }, i) => (
                <li key={tool.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <Link
                    href={toolHref(tool)}
                    tabIndex={-1}
                    onMouseEnter={() => setActive(i)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${
                      i === active ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]" : ""
                    }`}
                  >
                    <IconTile category={tool.category} toolId={tool.id} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-4">
                        <span className="font-medium">{tool.title}</span>
                        <span className="shrink-0 text-xs text-[color:var(--text-muted)]">
                          {categories[tool.category].label}
                        </span>
                      </span>
                      <span className="block truncate text-sm text-[color:var(--text-muted)]">{tool.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

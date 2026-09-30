"use client";

import { forwardRef, useRef, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name; also the placeholder if none is given. */
  label: string;
}

/** Search box with an icon and a clear button. Escape clears it too. */
const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, label, placeholder, onKeyDown, className = "", ...props },
  forwardedRef,
) {
  const localRef = useRef<HTMLInputElement | null>(null);

  function setRefs(el: HTMLInputElement | null) {
    localRef.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  }

  function clear() {
    onChange("");
    localRef.current?.focus();
  }

  return (
    <div className={`relative ${className}`}>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]" />
      <input
        ref={setRefs}
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
          onKeyDown?.(e);
        }}
        spellCheck={false}
        autoComplete="off"
        className="w-full rounded-md border border-[color:var(--border)] bg-transparent py-2 pl-9 pr-9 text-sm focus:outline focus:outline-1 focus:outline-[color:var(--accent)] [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});

export default SearchInput;

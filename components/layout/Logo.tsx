import Link from "next/link";

/* The "T" mark: a leaf-cut bar over an off-center stem, the stem a shade deeper. */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M3.5 3H22v.5C22 5.99 19.99 8 17.5 8h-14A1.5 1.5 0 0 1 2 6.5v-2A1.5 1.5 0 0 1 3.5 3Z" />
      <path
        opacity={0.78}
        d="M8.5 8h6.25v8.5a5 5 0 0 1-5 5H10A1.5 1.5 0 0 1 8.5 20V8Z"
      />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
      <LogoMark className="h-7 w-7 text-[color:var(--brand-accent-text)]" />
      <span className="sr-only">Toolio</span>
      {/* Wordmark with a dotless "ı" so the brand-green dot can replace the tittle. */}
      <span aria-hidden>
        Tool
        <span className="relative">
          ı
          <span className="absolute left-1/2 top-[0.1em] h-[0.22em] w-[0.22em] -translate-x-1/2 rounded-full bg-[color:var(--brand-accent-text)]" />
        </span>
        o
      </span>
    </Link>
  );
}

import Link from "next/link";
import { Toolbox } from "lucide-react";

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
      <span
        aria-hidden
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--accent)] text-[color:var(--on-accent)]"
      >
        <Toolbox className="h-4 w-4" strokeWidth={2.25} />
      </span>
      Toolio
    </Link>
  );
}

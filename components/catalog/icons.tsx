import {
  Braces,
  Calculator,
  Clock,
  Code,
  FileArchive,
  FileJson,
  FileText,
  Fingerprint,
  Hash,
  Image,
  KeyRound,
  Link,
  Regex,
  Ruler,
  Sheet,
  Table,
  Terminal,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { CategoryId } from "@/registry";

/** Hue per category, used for icon tiles. */
export const categoryTints: Record<CategoryId, string> = {
  developer: "#3B82F6",
  files: "#F97316",
  images: "#8B5CF6",
  text: "#10B981",
  data: "#06B6D4",
  calculators: "#F43F5E",
};

const categoryIcons: Record<CategoryId, LucideIcon> = {
  developer: Code,
  files: FileText,
  images: Image,
  text: Type,
  data: Table,
  calculators: Calculator,
};

// Per-tool icons; tools without one use their category's icon.
const toolIcons: Record<string, LucideIcon> = {
  "json-to-types": Braces,
  "curl-converter": Terminal,
  "regex-tester": Regex,
  "jwt-decoder": KeyRound,
  "json-formatter": FileJson,
  "pdf-compressor": FileArchive,
  "image-resizer": Image,
  "csv-cleaner": Sheet,
  "url-encoder": Link,
  "unix-timestamp": Clock,
  "uuid-generator": Fingerprint,
  "hash-generator": Hash,
  "word-counter": Type,
  "unit-converter": Ruler,
};

interface IconTileProps {
  category: CategoryId;
  toolId?: string;
  size?: "sm" | "md";
}

/** Tinted square with a category- or tool-specific icon. */
export function IconTile({ category, toolId, size = "md" }: IconTileProps) {
  const Icon = (toolId && toolIcons[toolId]) || categoryIcons[category];
  const tint = categoryTints[category];
  return (
    <span
      aria-hidden
      style={{ color: tint, backgroundColor: `color-mix(in srgb, ${tint} 16%, transparent)` }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${size === "sm" ? "h-8 w-8" : "h-10 w-10"}`}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2} />
    </span>
  );
}

import {
  Braces,
  Calculator,
  Clock,
  Code,
  FileArchive,
  FileCog,
  FileJson,
  FileText,
  Fingerprint,
  Globe,
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

/**
 * Hue per category, used for icon tiles. Muted mid-tones so they sit beside the pine/brass palette
 * and keep 3:1 icon contrast on both the dark and the light background.
 */
export const categoryTints: Record<CategoryId, string> = {
  developer: "#3F9A80",
  files: "#B08A45",
  images: "#8577B8",
  text: "#4F8FB0",
  data: "#3E9494",
  calculators: "#B0647A",
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
  "http-status": Globe,
  "env-generator": FileCog,
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

import {
  ArrowRightLeft,
  Binary,
  Braces,
  Calculator,
  CalendarClock,
  Clock,
  Code,
  CodeXml,
  Database,
  Diff,
  FileArchive,
  FileCheck2,
  FileCode,
  FileCode2,
  FileCog,
  FileDiff,
  FileJson,
  FileLock2,
  FileText,
  FileX,
  Fingerprint,
  GitBranch,
  Globe,
  Hash,
  Image,
  KeyRound,
  Link,
  ListTree,
  Regex,
  Rows3,
  Ruler,
  SearchCode,
  Sheet,
  Table,
  Tags,
  Terminal,
  Type,
  type LucideIcon,
} from "lucide-react";
import { tintColor } from "@/lib/category-theme-css";
import type { CategoryId } from "@/registry";

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
  "json-jsonl-converter": Rows3,
  "json-path-tester": SearchCode,
  "semver-calculator": Tags,
  "yaml-json-converter": FileCode2,
  "markdown-html-converter": FileCode,
  "html-formatter": CodeXml,
  "chmod-calculator": FileLock2,
  "xml-formatter": FileCheck2,
  "pdf-compressor": FileArchive,
  "image-resizer": Image,
  "csv-cleaner": Sheet,
  "url-encoder": Link,
  "url-parser": ListTree,
  "base64-converter": Binary,
  "gitignore-generator": FileX,
  "unix-timestamp": Clock,
  "uuid-generator": Fingerprint,
  "hash-generator": Hash,
  "http-status": Globe,
  "env-generator": FileCog,
  "cron-builder": CalendarClock,
  "sql-formatter": Database,
  "sql-to-mongo": ArrowRightLeft,
  "git-command-builder": GitBranch,
  "text-diff-checker": Diff,
  "git-diff-viewer": FileDiff,
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
  const tint = tintColor(category);
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

"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { panelClass, panelHeaderClass } from "./ToolPanels";

/**
 * Every tool's component, each in its own chunk, so a page downloads only the tool it shows.
 * Keep this out of the registry and out of server modules: Next.js ships every component a server page
 * can reach, so a loader there put all tools' code on every catalog and tool page.
 */
const bar = "rounded bg-[color:var(--border)] motion-safe:animate-pulse";

/** Shown for the moment a tool's code is downloading, shaped like the input and output panels it becomes. */
function ToolLoading() {
  return (
    <>
      <span role="status" className="sr-only">
        Loading tool…
      </span>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden className={`${panelClass} min-h-80`}>
          <div className={panelHeaderClass}>
            <span className={`${bar} h-3 w-16`} />
          </div>
          <div className="space-y-3 p-4">
            <div className={`${bar} h-3 w-3/4`} />
            <div className={`${bar} h-3 w-1/2`} />
            <div className={`${bar} h-3 w-2/3`} />
          </div>
        </div>
      ))}
    </>
  );
}

export const TOOL_COMPONENTS: Record<string, ComponentType> = {
  "base64-converter": dynamic(() => import("@/components/tools/developer/Base64Converter"), { loading: ToolLoading }),
  "case-converter": dynamic(() => import("@/components/tools/text/CaseConverter"), { loading: ToolLoading }),
  "chmod-calculator": dynamic(() => import("@/components/tools/developer/ChmodCalculator"), { loading: ToolLoading }),
  "cron-builder": dynamic(() => import("@/components/tools/developer/CronBuilder"), { loading: ToolLoading }),
  "csv-cleaner": dynamic(() => import("@/components/tools/data/CsvCleaner"), { loading: ToolLoading }),
  "curl-converter": dynamic(() => import("@/components/tools/developer/CurlConverter"), { loading: ToolLoading }),
  "data-size-converter": dynamic(() => import("@/components/tools/developer/DataSizeConverter"), { loading: ToolLoading }),
  "docker-command-builder": dynamic(() => import("@/components/tools/developer/DockerCommandBuilder"), { loading: ToolLoading }),
  "docker-compose-builder": dynamic(() => import("@/components/tools/developer/DockerComposeBuilder"), { loading: ToolLoading }),
  "env-generator": dynamic(() => import("@/components/tools/developer/EnvGenerator"), { loading: ToolLoading }),
  "fake-data-generator": dynamic(() => import("@/components/tools/data/FakeDataGenerator"), { loading: ToolLoading }),
  "find-replace": dynamic(() => import("@/components/tools/text/FindReplace"), { loading: ToolLoading }),
  "git-command-builder": dynamic(() => import("@/components/tools/developer/GitCommandBuilder"), { loading: ToolLoading }),
  "git-diff-viewer": dynamic(() => import("@/components/tools/developer/GitDiffViewer"), { loading: ToolLoading }),
  "gitignore-generator": dynamic(() => import("@/components/tools/developer/GitignoreGenerator"), { loading: ToolLoading }),
  "hash-generator": dynamic(() => import("@/components/tools/developer/HashGenerator"), { loading: ToolLoading }),
  "html-formatter": dynamic(() => import("@/components/tools/developer/HtmlFormatter"), { loading: ToolLoading }),
  "html-to-pdf": dynamic(() => import("@/components/tools/files/HtmlToPdf"), { loading: ToolLoading }),
  "http-status": dynamic(() => import("@/components/tools/developer/HttpStatus"), { loading: ToolLoading }),
  "images-to-pdf": dynamic(() => import("@/components/tools/files/ImagesToPdf"), { loading: ToolLoading }),
  "json-csv-converter": dynamic(() => import("@/components/tools/data/JsonCsvConverter"), { loading: ToolLoading }),
  "json-formatter": dynamic(() => import("@/components/tools/developer/JsonFormatter"), { loading: ToolLoading }),
  "json-jsonl-converter": dynamic(() => import("@/components/tools/data/JsonJsonlConverter"), { loading: ToolLoading }),
  "json-path-tester": dynamic(() => import("@/components/tools/developer/JsonPathTester"), { loading: ToolLoading }),
  "json-to-types": dynamic(() => import("@/components/tools/developer/JsonToTypes"), { loading: ToolLoading }),
  "jwt-decoder": dynamic(() => import("@/components/tools/developer/JwtDecoder"), { loading: ToolLoading }),
  "jwt-generator": dynamic(() => import("@/components/tools/developer/JwtGenerator"), { loading: ToolLoading }),
  "lorem-ipsum-generator": dynamic(() => import("@/components/tools/text/LoremIpsumGenerator"), { loading: ToolLoading }),
  "markdown-html-converter": dynamic(() => import("@/components/tools/text/MarkdownHtmlConverter"), { loading: ToolLoading }),
  "nginx-config-generator": dynamic(() => import("@/components/tools/developer/NginxConfigGenerator"), { loading: ToolLoading }),
  "og-preview": dynamic(() => import("@/components/tools/developer/OgPreview"), { loading: ToolLoading }),
  "pdf-compressor": dynamic(() => import("@/components/tools/files/PdfCompressor"), { loading: ToolLoading }),
  "pdf-editor": dynamic(() => import("@/components/tools/files/PdfEditor"), { loading: ToolLoading }),
  "pdf-merger": dynamic(() => import("@/components/tools/files/PdfMerger"), { loading: ToolLoading }),
  "pdf-metadata-editor": dynamic(() => import("@/components/tools/files/PdfMetadataEditor"), { loading: ToolLoading }),
  "pdf-page-numbers": dynamic(() => import("@/components/tools/files/PdfPageNumbers"), { loading: ToolLoading }),
  "pdf-page-organizer": dynamic(() => import("@/components/tools/files/PdfPageOrganizer"), { loading: ToolLoading }),
  "pdf-splitter": dynamic(() => import("@/components/tools/files/PdfSplitter"), { loading: ToolLoading }),
  "pdf-to-image": dynamic(() => import("@/components/tools/files/PdfToImage"), { loading: ToolLoading }),
  "pdf-to-text": dynamic(() => import("@/components/tools/files/PdfToText"), { loading: ToolLoading }),
  "pdf-watermark": dynamic(() => import("@/components/tools/files/PdfWatermark"), { loading: ToolLoading }),
  "regex-tester": dynamic(() => import("@/components/tools/developer/RegexTester"), { loading: ToolLoading }),
  "rotate-pdf": dynamic(() => import("@/components/tools/files/RotatePdf"), { loading: ToolLoading }),
  "semver-calculator": dynamic(() => import("@/components/tools/developer/SemverCalculator"), { loading: ToolLoading }),
  "sign-pdf": dynamic(() => import("@/components/tools/files/SignPdf"), { loading: ToolLoading }),
  "slug-generator": dynamic(() => import("@/components/tools/text/SlugGenerator"), { loading: ToolLoading }),
  "sql-formatter": dynamic(() => import("@/components/tools/developer/SqlFormatter"), { loading: ToolLoading }),
  "sql-to-mongo": dynamic(() => import("@/components/tools/developer/SqlToMongo"), { loading: ToolLoading }),
  "text-cleaner": dynamic(() => import("@/components/tools/text/TextCleaner"), { loading: ToolLoading }),
  "text-diff-checker": dynamic(() => import("@/components/tools/text/TextDiffChecker"), { loading: ToolLoading }),
  "time-zone-converter": dynamic(() => import("@/components/tools/calculators/TimeZoneConverter"), { loading: ToolLoading }),
  "unix-timestamp": dynamic(() => import("@/components/tools/developer/UnixTimestamp"), { loading: ToolLoading }),
  "url-encoder": dynamic(() => import("@/components/tools/developer/UrlEncoder"), { loading: ToolLoading }),
  "url-parser": dynamic(() => import("@/components/tools/developer/UrlParser"), { loading: ToolLoading }),
  "uuid-generator": dynamic(() => import("@/components/tools/developer/UuidGenerator"), { loading: ToolLoading }),
  "webhook-payload-tester": dynamic(() => import("@/components/tools/developer/WebhookPayloadTester"), { loading: ToolLoading }),
  "word-counter": dynamic(() => import("@/components/tools/text/WordCounter"), { loading: ToolLoading }),
  "xml-formatter": dynamic(() => import("@/components/tools/developer/XmlFormatter"), { loading: ToolLoading }),
  "xml-json-converter": dynamic(() => import("@/components/tools/data/XmlJsonConverter"), { loading: ToolLoading }),
  "yaml-json-converter": dynamic(() => import("@/components/tools/data/YamlJsonConverter"), { loading: ToolLoading }),
};

export default function ToolComponent({ id }: { id: string }) {
  const Tool = TOOL_COMPONENTS[id];
  return Tool ? <Tool /> : null;
}

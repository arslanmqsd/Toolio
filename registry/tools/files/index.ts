import type { ToolConfig } from "@/registry/types";
import pdfCompressor from "./pdf-compressor";
import pdfMerger from "./pdf-merger";
import pdfPageOrganizer from "./pdf-page-organizer";
import pdfSplitter from "./pdf-splitter";

export const fileTools: ToolConfig[] = [pdfPageOrganizer, pdfSplitter, pdfMerger, pdfCompressor];

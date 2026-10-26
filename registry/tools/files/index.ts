import type { ToolConfig } from "@/registry/types";
import pdfCompressor from "./pdf-compressor";
import pdfMerger from "./pdf-merger";
import pdfPageOrganizer from "./pdf-page-organizer";
import pdfSplitter from "./pdf-splitter";
import pdfToImage from "./pdf-to-image";

export const fileTools: ToolConfig[] = [pdfToImage, pdfPageOrganizer, pdfSplitter, pdfMerger, pdfCompressor];

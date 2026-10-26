import type { ToolConfig } from "@/registry/types";
import imagesToPdf from "./images-to-pdf";
import pdfCompressor from "./pdf-compressor";
import pdfMerger from "./pdf-merger";
import pdfPageOrganizer from "./pdf-page-organizer";
import pdfSplitter from "./pdf-splitter";
import pdfToImage from "./pdf-to-image";

export const fileTools: ToolConfig[] = [pdfToImage, imagesToPdf, pdfPageOrganizer, pdfSplitter, pdfMerger, pdfCompressor];

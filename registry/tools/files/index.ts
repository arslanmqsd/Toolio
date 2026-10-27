import type { ToolConfig } from "@/registry/types";
import imagesToPdf from "./images-to-pdf";
import pdfCompressor from "./pdf-compressor";
import pdfMerger from "./pdf-merger";
import pdfMetadataEditor from "./pdf-metadata-editor";
import pdfPageOrganizer from "./pdf-page-organizer";
import pdfSplitter from "./pdf-splitter";
import pdfToImage from "./pdf-to-image";
import pdfWatermark from "./pdf-watermark";

export const fileTools: ToolConfig[] = [pdfWatermark, pdfToImage, imagesToPdf, pdfPageOrganizer, pdfSplitter, pdfMerger, pdfCompressor, pdfMetadataEditor];

import type { ToolConfig } from "@/registry/types";
import imagesToPdf from "./images-to-pdf";
import pdfCompressor from "./pdf-compressor";
import pdfMerger from "./pdf-merger";
import pdfMetadataEditor from "./pdf-metadata-editor";
import pdfPageOrganizer from "./pdf-page-organizer";
import pdfSplitter from "./pdf-splitter";
import pdfToImage from "./pdf-to-image";
import pdfToText from "./pdf-to-text";
import pdfWatermark from "./pdf-watermark";
import rotatePdf from "./rotate-pdf";

export const fileTools: ToolConfig[] = [pdfWatermark, pdfToImage, pdfToText, imagesToPdf, pdfPageOrganizer, rotatePdf, pdfSplitter, pdfMerger, pdfCompressor, pdfMetadataEditor];

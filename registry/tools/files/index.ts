import type { ToolConfig } from "@/registry/types";
import htmlToPdf from "./html-to-pdf";
import imagesToPdf from "./images-to-pdf";
import pdfCompressor from "./pdf-compressor";
import pdfEditor from "./pdf-editor";
import pdfMerger from "./pdf-merger";
import pdfMetadataEditor from "./pdf-metadata-editor";
import pdfPageNumbers from "./pdf-page-numbers";
import pdfPageOrganizer from "./pdf-page-organizer";
import pdfSplitter from "./pdf-splitter";
import pdfToImage from "./pdf-to-image";
import pdfToText from "./pdf-to-text";
import pdfWatermark from "./pdf-watermark";
import redactPdf from "./redact-pdf";
import removePdfPages from "./remove-pdf-pages";
import rotatePdf from "./rotate-pdf";
import signPdf from "./sign-pdf";

export const fileTools: ToolConfig[] = [pdfEditor, signPdf, redactPdf, pdfWatermark, pdfToImage, pdfToText, imagesToPdf, htmlToPdf, pdfPageOrganizer, removePdfPages, rotatePdf, pdfPageNumbers, pdfSplitter, pdfMerger, pdfCompressor, pdfMetadataEditor];

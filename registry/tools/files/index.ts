import type { ToolConfig } from "@/registry/types";
import pdfCompressor from "./pdf-compressor";
import pdfMerger from "./pdf-merger";
import pdfSplitter from "./pdf-splitter";

export const fileTools: ToolConfig[] = [pdfSplitter, pdfMerger, pdfCompressor];

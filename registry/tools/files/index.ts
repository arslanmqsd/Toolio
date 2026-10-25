import type { ToolConfig } from "@/registry/types";
import pdfCompressor from "./pdf-compressor";
import pdfMerger from "./pdf-merger";

export const fileTools: ToolConfig[] = [pdfMerger, pdfCompressor];

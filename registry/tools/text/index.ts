import type { ToolConfig } from "@/registry/types";
import markdownHtmlConverter from "./markdown-html-converter";
import textDiffChecker from "./text-diff-checker";

export const textTools: ToolConfig[] = [textDiffChecker, markdownHtmlConverter];

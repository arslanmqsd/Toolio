import type { ToolConfig } from "@/registry/types";
import loremIpsumGenerator from "./lorem-ipsum-generator";
import markdownHtmlConverter from "./markdown-html-converter";
import slugGenerator from "./slug-generator";
import textDiffChecker from "./text-diff-checker";

export const textTools: ToolConfig[] = [textDiffChecker, markdownHtmlConverter, loremIpsumGenerator, slugGenerator];

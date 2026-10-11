import type { ToolConfig } from "@/registry/types";
import caseConverter from "./case-converter";
import loremIpsumGenerator from "./lorem-ipsum-generator";
import markdownHtmlConverter from "./markdown-html-converter";
import slugGenerator from "./slug-generator";
import textDiffChecker from "./text-diff-checker";
import wordCounter from "./word-counter";

export const textTools: ToolConfig[] = [textDiffChecker, markdownHtmlConverter, loremIpsumGenerator, slugGenerator, caseConverter, wordCounter];

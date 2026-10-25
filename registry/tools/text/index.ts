import type { ToolConfig } from "@/registry/types";
import caseConverter from "./case-converter";
import findReplace from "./find-replace";
import loremIpsumGenerator from "./lorem-ipsum-generator";
import markdownHtmlConverter from "./markdown-html-converter";
import slugGenerator from "./slug-generator";
import textCleaner from "./text-cleaner";
import textDiffChecker from "./text-diff-checker";
import wordCounter from "./word-counter";

export const textTools: ToolConfig[] = [findReplace, textCleaner, textDiffChecker, markdownHtmlConverter, loremIpsumGenerator, slugGenerator, caseConverter, wordCounter];

/**
 * HTML formatting with Prettier and minifying with html-minifier-terser, both in the browser. The
 * defaults never change how a page renders: whitespace between inline elements, <pre> and
 * <textarea> are kept, and riskier savings are opt-in.
 */
import * as prettier from "prettier/standalone";
import * as babel from "prettier/plugins/babel";
import * as estree from "prettier/plugins/estree";
import * as html from "prettier/plugins/html";
import * as postcss from "prettier/plugins/postcss";
import type { Options as MinifierOptions } from "html-minifier-terser";

export interface FormatOptions {
  indent: "2" | "4" | "tab";
  /** Lines longer than this are wrapped where whitespace allows. */
  printWidth: number;
  /** Also format the CSS in <style> and the JS in <script>. */
  formatEmbedded: boolean;
}

export interface MinifyOptions {
  /** "safe" collapses runs of whitespace to one space; "aggressive" also removes it between blocks. */
  whitespace: "safe" | "aggressive" | "keep";
  removeComments: boolean;
  minifyCss: boolean;
  minifyJs: boolean;
  /** Drop closing tags and attribute quotes HTML doesn't need. Smaller, but harder to read or template. */
  removeOptional: boolean;
}

export const DEFAULT_FORMAT: FormatOptions = { indent: "2", printWidth: 80, formatEmbedded: true };

export const DEFAULT_MINIFY: MinifyOptions = { whitespace: "safe", removeComments: true, minifyCss: true, minifyJs: true, removeOptional: false };

export interface HtmlError {
  message: string;
  line: number;
  column: number;
}

export type HtmlResult = { ok: true; output: string; notices: string[] } | { ok: false; error: HtmlError };

const PLUGINS = [html, postcss, babel, estree];

export async function formatHtml(text: string, options: FormatOptions): Promise<HtmlResult> {
  if (text.trim() === "") return { ok: true, output: "", notices: [] };
  try {
    const output = await prettier.format(text, {
      parser: "html",
      plugins: PLUGINS,
      useTabs: options.indent === "tab",
      tabWidth: options.indent === "4" ? 4 : 2,
      printWidth: options.printWidth,
      embeddedLanguageFormatting: options.formatEmbedded ? "auto" : "off",
      // Whitespace is only moved where CSS says it doesn't show, so the page renders the same.
      htmlWhitespaceSensitivity: "css",
    });
    return { ok: true, output, notices: [] };
  } catch (err) {
    const { message, loc } = err as Error & { loc?: { start: { line: number; column: number } } };
    return {
      ok: false,
      error: {
        // The first sentence; Prettier adds a link, the position and a code frame.
        message: message.split("\n")[0].replace(/ For more info see \S+/, "").replace(/ \(\d+:\d+\)$/, ""),
        line: loc?.start.line ?? 1,
        column: loc?.start.column ?? 1,
      },
    };
  }
}

export async function minifyHtml(text: string, options: MinifyOptions): Promise<HtmlResult> {
  // About 2 MB with clean-css and terser, so it's only loaded once someone minifies.
  const { minify } = await import("html-minifier-terser/dist/htmlminifier.esm.bundle");
  const notices = new Set<string>();
  // `log` is an option the types leave out.
  const minifierOptions: MinifierOptions & { log: (entry: unknown) => void } = {
    collapseWhitespace: options.whitespace !== "keep",
    conservativeCollapse: options.whitespace === "safe",
    removeComments: options.removeComments,
    // Never @import anything: inlining a stylesheet would mean fetching it.
    minifyCSS: options.minifyCss ? { inline: ["none"] } : false,
    minifyJS: options.minifyJs,
    collapseBooleanAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    // In inline SVG and MathML a missing "/" leaves the element open, swallowing what follows.
    keepClosingSlash: true,
    removeOptionalTags: options.removeOptional,
    removeAttributeQuotes: options.removeOptional,
    log: (entry: unknown) => {
      // Called with timing messages too; only failures matter here.
      if (entry instanceof Error) notices.add(`An inline script couldn't be minified, so it's kept as written: ${entry.message}`);
      else if (typeof entry === "string" && !entry.startsWith("minified in")) notices.add(`Some inline CSS couldn't be minified, so it's kept as written: ${entry}`);
    },
  };
  try {
    const output = await minify(text, minifierOptions);
    return { ok: true, output, notices: [...notices] };
  } catch (err) {
    return { ok: false, error: parseErrorAt(text, (err as Error).message) };
  }
}

/** The minifier's parse errors read "Parse Error: <the rest of the input>"; find where that starts. */
function parseErrorAt(text: string, message: string): HtmlError {
  const rest = message.startsWith("Parse Error: ") ? message.slice("Parse Error: ".length) : "";
  const offset = rest ? Math.max(0, text.lastIndexOf(rest.slice(0, 200))) : 0;
  const before = text.slice(0, offset).split("\n");
  const tag = rest.match(/^<\/?[\w-]*/)?.[0];
  return {
    message: tag ? `Can't read the tag starting ${tag}. Check for a missing > or an unclosed quote.` : rest ? "Can't read the HTML here." : message,
    line: before.length,
    column: before[before.length - 1].length + 1,
  };
}

/** Bytes after gzip, as a server would usually send it. */
export async function gzipSize(text: string): Promise<number> {
  const stream = new Response(text).body!.pipeThrough(new CompressionStream("gzip"));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

export interface HtmlRequest {
  text: string;
  mode: "format" | "minify";
  format: FormatOptions;
  minify: MinifyOptions;
}

export interface HtmlSizes {
  input: number;
  output: number;
  inputGzip: number;
  outputGzip: number;
}

export type HtmlJobResult = (HtmlResult & { ok: false; mode: HtmlRequest["mode"] }) | (HtmlResult & { ok: true; mode: HtmlRequest["mode"]; sizes: HtmlSizes });

export async function processHtml({ text, mode, format, minify }: HtmlRequest): Promise<HtmlJobResult> {
  const result = mode === "format" ? await formatHtml(text, format) : await minifyHtml(text, minify);
  if (!result.ok) return { ...result, mode };
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const [inputGzip, outputGzip] = await Promise.all([gzipSize(text), gzipSize(result.output)]);
  return { ...result, mode, sizes: { input: bytes(text), output: bytes(result.output), inputGzip, outputGzip } };
}

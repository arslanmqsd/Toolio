/**
 * The HTML Formatter's options, apart from html-format so the page can use them without loading
 * Prettier and the minifier, which only the worker needs.
 */
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

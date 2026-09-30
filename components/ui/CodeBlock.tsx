interface CodeBlockProps {
  code: string;
  /** Spaces a tab renders as. */
  tabSize?: 2 | 4;
  /** Wrap long lines instead of scrolling (for data rather than source code). */
  wrap?: boolean;
}

/** Read-only code or data output, placed inside an OutputPanel. */
export default function CodeBlock({ code, tabSize = 2, wrap = false }: CodeBlockProps) {
  return (
    <pre className={`${tabSize === 4 ? "[tab-size:4]" : "[tab-size:2]"} ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
      <code>{code}</code>
    </pre>
  );
}

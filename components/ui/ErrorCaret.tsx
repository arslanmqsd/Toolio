interface ErrorCaretProps {
  /** The line of input the problem is on. */
  line: string;
  /** Where on that line, counting from 1. */
  column: number;
  className?: string;
}

/** A line of input with a ^ under the column a problem is at. */
export default function ErrorCaret({ line, column, className = "" }: ErrorCaretProps) {
  return (
    <pre className={`overflow-x-auto whitespace-pre font-[family-name:var(--font-mono)] text-xs text-[color:var(--text)] ${className}`}>
      {line}
      {"\n"}
      {/* Tabs kept so the caret lines up under tab-indented text. */}
      <span className="text-[color:var(--error)]">{line.slice(0, column - 1).replace(/[^\t]/g, " ")}^</span>
    </pre>
  );
}

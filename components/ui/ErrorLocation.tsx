import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import ErrorCaret from "@/components/ui/ErrorCaret";

interface ErrorLocationProps {
  /** The text the error is in. */
  source: string;
  /** Counting from 1. */
  line: number;
  column: number;
  onShow: () => void;
  showLabel?: string;
  /** More buttons, next to the one that shows the error. */
  actions?: ReactNode;
}

/** Where in the input a parse error is: line and column, the line with a caret, and a button that selects it. */
export default function ErrorLocation({ source, line, column, onShow, showLabel = "Show in input", actions }: ErrorLocationProps) {
  return (
    <>
      <p className="mt-3 text-xs text-[color:var(--text-muted)]">
        Line {line}, column {column}
      </p>
      <ErrorCaret line={source.split("\n")[line - 1] ?? ""} column={column} className="mt-2" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onShow}>
          {showLabel}
        </Button>
        {actions}
      </div>
    </>
  );
}

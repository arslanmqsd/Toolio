import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** Monospace field styling, red when the content is invalid. */
export function codeFieldClass(invalid = false): string {
  return `w-full rounded-md border bg-transparent font-[family-name:var(--font-mono)] text-sm focus:outline focus:outline-1 ${
    invalid
      ? "border-[color:var(--error)] focus:outline-[color:var(--error)]"
      : "border-[color:var(--border)] focus:outline-[color:var(--accent)]"
  }`;
}

interface CodeTextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Multi-line code/text input. Sets aria-invalid from `invalid` and turns off spellcheck and autocomplete. */
export const CodeTextArea = forwardRef<HTMLTextAreaElement, CodeTextAreaProps>(function CodeTextArea(
  { invalid = false, className = "", ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      spellCheck={false}
      autoComplete="off"
      aria-invalid={invalid}
      className={`${codeFieldClass(invalid)} resize-y p-3 ${className}`}
      {...props}
    />
  );
});

interface CodeInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/** Single-line counterpart of CodeTextArea. */
export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { invalid = false, className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      spellCheck={false}
      autoComplete="off"
      aria-invalid={invalid}
      className={`${codeFieldClass(invalid)} px-3 py-2 ${className}`}
      {...props}
    />
  );
});

import { forwardRef, type InputHTMLAttributes } from "react";

/**
 * Single-line input for plain text (emails, names), in the UI face. For code or data, use CodeInput.
 * Set aria-invalid to give it the error border.
 */
const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:outline-none aria-[invalid=true]:border-[color:var(--error)] ${className}`}
      {...props}
    />
  );
});

export default TextInput;

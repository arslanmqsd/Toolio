/** Escapes `text` for a POSIX extended regex (grep -E). Leaves "/" alone: GNU grep warns about "\/". */
export function escapeEre(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

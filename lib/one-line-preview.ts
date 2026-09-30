/** `value` collapsed to one line and cut to `max` characters with an ellipsis, for previews of pasted or saved text. */
export function oneLinePreview(value: string, max: number): string {
  const oneLine = value.trim().replace(/\s+/g, " ");
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

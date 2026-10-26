/** Starts a browser download of `content` named `filename`. */
export function saveFile(content: BlobPart, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoke after the click has started the download; revoking straight away can cancel it in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

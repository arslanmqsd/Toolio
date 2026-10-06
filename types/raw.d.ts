/** A file's text, imported with a `?raw` suffix (Vite natively, webpack via next.config.mjs). */
declare module "*?raw" {
  const content: string;
  export default content;
}

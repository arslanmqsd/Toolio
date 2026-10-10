/** Bytes after gzip, as a server would usually send it. */
export async function gzipSize(text: string): Promise<number> {
  const stream = new Response(text).body!.pipeThrough(new CompressionStream("gzip"));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

/** Sizes before and after a tool rewrites text, in UTF-8 bytes, plain and gzipped. */
export interface SizeChange {
  input: number;
  output: number;
  inputGzip: number;
  outputGzip: number;
}

export async function measureSizeChange(input: string, output: string): Promise<SizeChange> {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const [inputGzip, outputGzip] = await Promise.all([gzipSize(input), gzipSize(output)]);
  return { input: bytes(input), output: bytes(output), inputGzip, outputGzip };
}

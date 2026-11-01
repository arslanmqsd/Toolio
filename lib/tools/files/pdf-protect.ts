/**
 * Password-protecting a PDF with qpdf (the reference PDF toolkit, compiled to WebAssembly): AES-256, the
 * strongest encryption PDFs have, which every current reader opens.
 */

import type { QpdfInstance } from "@neslinesli93/qpdf-wasm";

const IN = "/in.pdf";
const OUT = "/out.pdf";

/**
 * Whether a PDF is already encrypted: its trailer must point to an /Encrypt dictionary. (qpdf's own
 * --requires-password check fails on every file in this WebAssembly build.)
 */
export const isEncrypted = (input: Uint8Array) => /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(new TextDecoder("latin1").decode(input));

/** qpdf's exit codes: 0 done, 2 failed, 3 done with warnings (a slightly damaged file it could still repair). */
const ok = (code: number) => code === 0 || code === 3;

/**
 * The PDF encrypted so it opens only with `password`. The same password is the owner password, so
 * whoever can open it can also change or remove the protection. Throws "encrypted" for a PDF that
 * already has a password, and "damaged" for one qpdf can't read.
 */
export function protectPdf(qpdf: QpdfInstance, input: Uint8Array, password: string): Uint8Array {
  if (!password) throw new Error("A password is needed.");
  const fs = qpdf.FS as QpdfInstance["FS"] & { writeFile: (path: string, data: Uint8Array) => void; unlink: (path: string) => void };
  if (isEncrypted(input)) throw new Error("encrypted");
  fs.writeFile(IN, input);
  try {
    // Arguments go straight to qpdf, not through a shell, so any character in the password is safe.
    const code = qpdf.callMain(["--encrypt", `--user-password=${password}`, `--owner-password=${password}`, "--bits=256", "--", IN, OUT]);
    if (!ok(code)) throw new Error("damaged");
    return fs.readFile(OUT);
  } finally {
    for (const path of [IN, OUT]) {
      try {
        fs.unlink(path);
      } catch {
        // Not written.
      }
    }
  }
}

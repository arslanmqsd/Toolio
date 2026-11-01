/**
 * Adding and removing PDF passwords with qpdf (the reference PDF toolkit, compiled to WebAssembly).
 * Protecting uses AES-256, the strongest encryption PDFs have, which every current reader opens.
 */

import type { QpdfInstance } from "@neslinesli93/qpdf-wasm";

const IN = "/in.pdf";
const OUT = "/out.pdf";

type Fs = QpdfInstance["FS"] & { writeFile: (path: string, data: Uint8Array) => void; unlink: (path: string) => void };

/**
 * Whether a PDF is encrypted: its trailer must point to an /Encrypt dictionary. (qpdf's own
 * --requires-password check fails on every file in this WebAssembly build.)
 */
export const isEncrypted = (input: Uint8Array) => /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(new TextDecoder("latin1").decode(input));

/** qpdf's exit codes: 0 done, 2 failed, 3 done with warnings (a slightly damaged file it could still repair). */
const ok = (code: number) => code === 0 || code === 3;

/**
 * Runs `work` with the input written to qpdf's in-memory disk, then clears both files, so a password-
 * protected or decrypted copy never lingers between runs.
 */
function withInput<T>(qpdf: QpdfInstance, input: Uint8Array, work: (fs: Fs) => T): T {
  const fs = qpdf.FS as Fs;
  fs.writeFile(IN, input);
  try {
    return work(fs);
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

/**
 * The PDF encrypted so it opens only with `password`. The same password is the owner password, so
 * whoever can open it can also change or remove the protection. Throws "encrypted" for a PDF that
 * already has a password, and "damaged" for one qpdf can't read.
 */
export function protectPdf(qpdf: QpdfInstance, input: Uint8Array, password: string): Uint8Array {
  if (!password) throw new Error("A password is needed.");
  if (isEncrypted(input)) throw new Error("encrypted");
  return withInput(qpdf, input, (fs) => {
    // Arguments go straight to qpdf, not through a shell, so any character in the password is safe.
    const code = qpdf.callMain(["--encrypt", `--user-password=${password}`, `--owner-password=${password}`, "--bits=256", "--", IN, OUT]);
    if (!ok(code)) throw new Error("damaged");
    return fs.readFile(OUT);
  });
}

/** What's locking a PDF: nothing, an open password, or only restrictions (printing, copying…) it opens without. */
export type Lock = "none" | "password" | "restrictions";

export function lockOf(qpdf: QpdfInstance, input: Uint8Array): Lock {
  if (!isEncrypted(input)) return "none";
  // Counting pages needs the file open; with no password given, that works only when it has no open password.
  return withInput(qpdf, input, () => (ok(qpdf.callMain(["--show-npages", IN])) ? "restrictions" : "password"));
}

/**
 * The PDF with its password and restrictions removed. `password` opens it; leave it empty for a PDF
 * that only has restrictions. Throws "not-encrypted" when there's nothing to remove, and "password"
 * when it won't open with the password given.
 */
export function unlockPdf(qpdf: QpdfInstance, input: Uint8Array, password: string): Uint8Array {
  if (!isEncrypted(input)) throw new Error("not-encrypted");
  return withInput(qpdf, input, (fs) => {
    const code = qpdf.callMain([`--password=${password}`, "--decrypt", "--", IN, OUT]);
    // An encrypted file that qpdf can't open is nearly always the wrong password: it repairs most damage.
    if (!ok(code)) throw new Error("password");
    return fs.readFile(OUT);
  });
}

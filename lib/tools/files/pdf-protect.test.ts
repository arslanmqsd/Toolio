import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import createModule, { type QpdfInstance } from "@neslinesli93/qpdf-wasm";
import { PDFDocument } from "pdf-lib";
import { isEncrypted, protectPdf } from "./pdf-protect";

let qpdf: QpdfInstance;
const wasm = createRequire(import.meta.url).resolve("@neslinesli93/qpdf-wasm/dist/qpdf.wasm");

beforeAll(async () => {
  // qpdf writes its checks to the console; keep test output clean.
  qpdf = await createModule({ locateFile: () => wasm, print: () => {}, printErr: () => {} } as Parameters<typeof createModule>[0]);
});

async function sample() {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.addPage([200, 200]);
  return doc.save();
}

type Fs = QpdfInstance["FS"] & { writeFile: (path: string, data: Uint8Array) => void };

/** Runs qpdf on a file and gives its exit code. */
function run(bytes: Uint8Array, args: string[]): number {
  (qpdf.FS as Fs).writeFile("/t.pdf", bytes);
  return qpdf.callMain([...args, "/t.pdf"]);
}

/** The file decrypted with `password`, read back by pdf-lib. */
async function decrypt(bytes: Uint8Array, password: string) {
  (qpdf.FS as Fs).writeFile("/t.pdf", bytes);
  expect(qpdf.callMain([`--password=${password}`, "--decrypt", "/t.pdf", "/plain.pdf"])).toBe(0);
  return PDFDocument.load(qpdf.FS.readFile("/plain.pdf"));
}

describe("protectPdf", () => {
  it("makes a PDF that needs a password to open", async () => {
    const out = protectPdf(qpdf, await sample(), "hunter2");
    expect(run(out, ["--check"])).toBe(2);
    expect(run(out, ["--check", "--password=hunter2"])).toBe(0);
  });

  it("can't be read without the password", async () => {
    const out = protectPdf(qpdf, await sample(), "hunter2");
    await expect(PDFDocument.load(out)).rejects.toThrow(/encrypted/);
    expect(run(out, ["--check", "--password=wrong"])).toBe(2);
  });

  it("opens with the password, pages intact", async () => {
    const out = protectPdf(qpdf, await sample(), "hunter2");
    expect((await decrypt(out, "hunter2")).getPageCount()).toBe(2);
  });

  it("uses AES-256 (revision 6)", async () => {
    const text = new TextDecoder("latin1").decode(protectPdf(qpdf, await sample(), "hunter2"));
    expect(text).toMatch(/\/R 6\b/);
    expect(text).toMatch(/\/V 5\b/);
  });

  it("takes any characters in the password", async () => {
    const password = `p@ss "wörd" --decrypt; $HOME`;
    const out = protectPdf(qpdf, await sample(), password);
    expect((await decrypt(out, password)).getPageCount()).toBe(2);
  });

  it("refuses a PDF that already has a password", async () => {
    const once = protectPdf(qpdf, await sample(), "first");
    expect(() => protectPdf(qpdf, once, "second")).toThrow("encrypted");
  });

  it("refuses a file that isn't a PDF", () => {
    expect(() => protectPdf(qpdf, new TextEncoder().encode("not a pdf"), "pw")).toThrow("damaged");
  });

  it("needs a password", async () => {
    expect(() => protectPdf(qpdf, new Uint8Array(), "")).toThrow("A password is needed.");
  });

  it("tells protected PDFs from plain ones", async () => {
    expect(isEncrypted(protectPdf(qpdf, await sample(), "pw"))).toBe(true);
    expect(isEncrypted(await sample())).toBe(false);
  });

  it("cleans up its working files between runs", async () => {
    protectPdf(qpdf, await sample(), "hunter2");
    expect(() => qpdf.FS.readFile("/out.pdf")).toThrow();
  });
});

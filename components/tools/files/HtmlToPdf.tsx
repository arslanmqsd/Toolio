"use client";

import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { Printer } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeTextArea } from "@/components/ui/CodeField";
import FileDrop from "@/components/ui/FileDrop";
import HtmlPreview from "@/components/ui/HtmlPreview";
import LabelledControl from "@/components/ui/LabelledControl";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { readTextFile } from "@/lib/files/text-file";
import { sanitizePage } from "@/lib/html-preview";
import { DEFAULT_SETUP, MARGINS, PAGE_SIZES, pageMm, printableWidthPx, printDocument, type PageSetup } from "@/lib/tools/files/html-to-pdf";

const EXAMPLE = `<!DOCTYPE html>
<html lang="en">
<head>
<title>Invoice 1042</title>
<style>
  body { font: 14px/1.5 Georgia, serif; color: #1d2433; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; padding: 24px; background: #1f4e46; color: #fff; }
  header h1 { margin: 0; font-size: 28px; letter-spacing: .02em; }
  main { padding: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #d5dbe3; text-align: left; }
  th { background: #eef2f6; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: bold; border-bottom: 0; }
  .terms { break-before: page; }
</style>
</head>
<body>
<header><h1>Invoice 1042</h1><span>Due 30 November 2026</span></header>
<main>
  <p><strong>Billed to</strong><br>Northwind Traders<br>12 Harbour Street, Leeds</p>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead>
    <tbody>
      <tr><td>Website audit</td><td class="num">1</td><td class="num">£900.00</td><td class="num">£900.00</td></tr>
      <tr><td>Design workshop (half day)</td><td class="num">2</td><td class="num">£450.00</td><td class="num">£900.00</td></tr>
      <tr><td>Accessibility fixes</td><td class="num">12 h</td><td class="num">£75.00</td><td class="num">£900.00</td></tr>
    </tbody>
    <tfoot><tr><td colspan="3" class="num">Amount due</td><td class="num">£2,700.00</td></tr></tfoot>
  </table>
  <section class="terms">
    <h2>Terms</h2>
    <p>This section starts on a new page, because its CSS says <code>break-before: page</code>.</p>
  </section>
</main>
</body>
</html>`;

const SIZES = PAGE_SIZES.map(({ id, label }) => ({ id, label }));
const ORIENTATIONS = [
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
] as const;
const MARGIN_OPTIONS = MARGINS.map(({ id, label }) => ({ id, label }));

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Prints a document in a hidden frame. allow-same-origin lets this page call print() on it and
 * allow-modals lets the dialog open; with no allow-scripts nothing in it can run, and the HTML is
 * sanitized and under a no-script CSP besides.
 */
let printFrame: HTMLIFrameElement | null = null;

function printHtml(doc: string) {
  // afterprint doesn't always fire, so a new print also clears the last one's frame.
  printFrame?.remove();
  const frame = (printFrame = document.createElement("iframe"));
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Off screen but laid out: some browsers print a blank page from a frame that isn't rendered.
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  // load waits for the page's images, so they're in the PDF.
  frame.onload = () => {
    const win = frame.contentWindow!;
    win.addEventListener("afterprint", () => frame.remove(), { once: true });
    win.focus();
    win.print();
  };
  frame.srcdoc = doc;
  document.body.appendChild(frame);
}

/** Shrinks a page-wide preview to fit the panel, like a print preview, instead of scrolling sideways. */
function FitWidth({ width, children }: { width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / width)));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [width]);
  return (
    // The scaled frame keeps its full layout size, so the wrapper is sized to what's seen.
    <div ref={ref} style={{ height: `calc(${PREVIEW_HEIGHT} * ${scale})` }}>
      <div style={{ width, marginInline: "auto", transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}

const PREVIEW_HEIGHT = "40rem";

export default function HtmlToPdf() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useToolInput(EXAMPLE, () => setFileBase(null));
  const [setup, setSetup] = useState<PageSetup>(DEFAULT_SETUP);
  const [fileBase, setFileBase] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [printed, setPrinted] = useState(false);
  const previewHtml = useDeferredValue(text);

  const empty = text.trim() === "";
  const set = <K extends keyof PageSetup>(key: K, value: PageSetup[K]) => setSetup((s) => ({ ...s, [key]: value }));
  const [widthMm, heightMm] = pageMm(setup);
  const width = printableWidthPx(setup);

  async function loadFile(file: File) {
    const read = await readTextFile(file, MAX_FILE_BYTES);
    if (!read.ok) return setFileError(read.error);
    setFileError(undefined);
    setText(read.text);
    setFileBase(file.name.replace(/\.[^.]+$/, "") || null);
  }

  function save() {
    const page = sanitizePage(text);
    // The page's own <title> names the PDF, then the file it came from.
    const title = new DOMParser().parseFromString(text, "text/html").title.trim() || fileBase || "document";
    printHtml(printDocument(page.body, page.bodyAttributes, setup, title));
    setPrinted(true);
  }

  return (
    <>
      <InputPanel label="HTML">
        <div className="space-y-4">
          <div className="space-y-2">
            <CodeTextArea
              ref={inputRef}
              aria-label="HTML input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              placeholder="<h1>Paste a web page's HTML here.</h1>"
            />
            <FileDrop compact accept=".html,.htm,text/html" what="an .html file" onFiles={([file]) => loadFile(file)} />
            {fileError && (
              <p role="alert" className="text-xs text-[color:var(--error)]">
                {fileError}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LabelledControl label="Page size">
              <SegmentedControl label="Page size" options={SIZES} value={setup.size} onChange={(v) => set("size", v)} />
            </LabelledControl>
            <LabelledControl label="Orientation">
              <SegmentedControl label="Orientation" options={ORIENTATIONS} value={setup.orientation} onChange={(v) => set("orientation", v)} />
            </LabelledControl>
            <LabelledControl label="Margins">
              <SegmentedControl label="Margins" options={MARGIN_OPTIONS} value={setup.margin} onChange={(v) => set("margin", v)} />
            </LabelledControl>
          </div>
          <Checkbox checked={setup.backgrounds} onChange={(v) => set("backgrounds", v)}>
            Print background colors and images
          </Checkbox>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setText("");
                inputRef.current?.focus();
              }}
              disabled={text === ""}
            >
              Clear
            </Button>
            <Button size="sm" onClick={() => setText(EXAMPLE)} disabled={text === EXAMPLE}>
              Load example
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label="PDF" copyable={false}>
        {empty ? (
          <Alert title="Nothing to convert" tone="warn">
            <p>Paste HTML into the input, or drop an .html file.</p>
            <Button size="sm" onClick={() => setText(EXAMPLE)} className="mt-3">
              Load example
            </Button>
          </Alert>
        ) : (
          <div className="space-y-4 font-[family-name:var(--font-ui)]">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" icon={Printer} onClick={save}>
                Save as PDF
              </Button>
              <p className="text-sm text-[color:var(--text-muted)]" aria-live="polite">
                {printed ? "In the print dialog, set the destination to “Save as PDF”." : "Opens your browser's print dialog: choose “Save as PDF”."}
              </p>
            </div>
            <p className="text-xs text-[color:var(--text-muted)]">
              Preview at the page&apos;s printable width, scaled to fit ({Math.round(widthMm)} × {Math.round(heightMm)} mm, {width} px inside the margins), so lines wrap where they
              will in the PDF. Scripts, forms and linked stylesheets are left out; images load from their own sites.
            </p>
            <FitWidth width={width}>
              <HtmlPreview html={previewHtml} styling="page" width={width} className="block !h-[40rem] !max-h-none" />
            </FitWidth>
          </div>
        )}
      </OutputPanel>
    </>
  );
}

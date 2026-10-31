"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronLeft,
  ChevronRight,
  Circle,
  Cloud,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  MousePointer2,
  MoveUpRight,
  Redo2,
  RotateCcw,
  RotateCcwSquare,
  RotateCwSquare,
  Pencil,
  PaintBucket,
  Save,
  PenLine,
  Pentagon,
  Shapes,
  Signature as SignatureIcon,
  Slash,
  Square,
  SquareArrowDownRight,
  Stamp as StampIcon,
  StickyNote,
  Trash2,
  Type,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ColorPicker from "@/components/ui/ColorPicker";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import SelectedFile from "@/components/ui/SelectedFile";
import TaskProgress from "@/components/ui/TaskProgress";
import { formatBytes } from "@/lib/format-bytes";
import { plural } from "@/lib/notices";
import {
  COMMENT_SIZE,
  cloudPath,
  eraseInk,
  eraseMarkup,
  eraseShape,
  linePaths,
  pathD,
  polyPath,
  LINE_HEIGHT,
  MARK_LINE_AT,
  TEXT_ASCENT,
  type Box,
  type EditItem,
  type EditProgress,
  type ImageRotation,
  type MarkupStyle,
  type TextAlign,
  type TextStyle,
} from "@/lib/tools/files/pdf-editor";
import type { PdfEditorRequest } from "@/lib/tools/files/pdf-editor.worker";
import { SWATCH_ROWS } from "@/lib/tools/files/pdf-colors";
import { PDF_MAX_BYTES, pdfErrorMessage } from "@/lib/tools/files/pdf-errors";
import { PDF_FONT_CSS, PDF_FONT_OPTIONS, type PdfFont } from "@/lib/tools/files/pdf-fonts";
import { openPdfRenderer, type PdfRenderer } from "@/lib/tools/files/pdf-render";
import { charAt, selectionRects, splitChars, type Char } from "@/lib/tools/files/pdf-text-select";
import { imageSize, prepareImage } from "@/lib/tools/files/prepare-image";
import { unsupportedCharacters } from "@/lib/tools/files/pdf-watermark";
import { runWorkerTask } from "@/lib/worker-task";
import { STANDARD_STAMPS, stampName, stampSize, type Stamp } from "@/lib/tools/files/pdf-stamps";
import { StampDrawing, StampPicker, stampWidthAt1 } from "./PdfStamps";
import { SignaturePicker, type Signature } from "./PdfSignatures";

function createWorker() {
  return new Worker(new URL("../../../lib/tools/files/pdf-editor.worker.ts", import.meta.url));
}

type Tool =
  | "select"
  | "text"
  | MarkupStyle
  | "ink"
  | "marker"
  | "eraser"
  | "rect"
  | "ellipse"
  | "arc"
  | "polygon"
  | "cloud"
  | "line"
  | "polyline"
  | "arrow"
  | "stamp"
  | "signature"
  | "comment";

/** Tools that add a shape by dragging from one corner (or end) to the other, or by a single click. */
type DragTool = "highlight" | "rect" | "ellipse" | "arc" | "cloud" | "line" | "arrow";
const isDragTool = (tool: string): tool is DragTool => ["highlight", "rect", "ellipse", "arc", "cloud", "line", "arrow"].includes(tool);

/** Tools that add corners one click at a time. */
const isPolyTool = (tool: string): tool is "polyline" | "polygon" => tool === "polyline" || tool === "polygon";

/** Small line icons for shapes lucide doesn't draw the way the toolbar needs. */
function PathIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
type Tab = "annotate" | "shapes" | "insert";
type Item = EditItem & { id: number };
type Point = { x: number; y: number };

const isTextMark = (tool: string): tool is "underline" | "strike" | "squiggly" => tool === "underline" || tool === "strike" || tool === "squiggly";

/** The letter "A" marked the way a text tool marks text, as that tool's icon. */
function MarkIcon({ style }: { style: MarkupStyle }) {
  const look = {
    highlight: { background: "#ffeb5a", color: "#111" },
    underline: { textDecoration: "underline", textDecorationThickness: "2px" },
    strike: { textDecoration: "line-through", textDecorationThickness: "2px" },
    squiggly: { textDecoration: "underline wavy", textDecorationColor: "#e74c3c", textUnderlineOffset: "1px" },
  }[style];
  return (
    <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-sm text-[0.9rem] font-semibold leading-none" style={look}>
      A
    </span>
  );
}

const icon = (Icon: LucideIcon) => <Icon aria-hidden className="h-4 w-4" />;

/** Tools grouped into tabs, like most PDF editors; each tab starts with Select so items can be picked up. */
const TABS: { id: Tab; label: string; icon: LucideIcon; tools: { id: Tool; label: string; icon: ReactNode }[] }[] = [
  {
    id: "annotate",
    label: "Annotate",
    icon: PenLine,
    tools: [
      { id: "select", label: "Select and move", icon: icon(MousePointer2) },
      { id: "highlight", label: "Highlight text", icon: <MarkIcon style="highlight" /> },
      { id: "underline", label: "Underline text", icon: <MarkIcon style="underline" /> },
      { id: "strike", label: "Strike through text", icon: <MarkIcon style="strike" /> },
      { id: "squiggly", label: "Squiggly underline", icon: <MarkIcon style="squiggly" /> },
      { id: "ink", label: "Pen", icon: icon(Pencil) },
      { id: "marker", label: "Highlighter pen", icon: icon(Highlighter) },
      { id: "text", label: "Text", icon: icon(Type) },
      { id: "comment", label: "Comment", icon: icon(StickyNote) },
      { id: "eraser", label: "Eraser", icon: icon(Eraser) },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    icon: Shapes,
    tools: [
      { id: "select", label: "Select and move", icon: icon(MousePointer2) },
      { id: "rect", label: "Rectangle", icon: icon(Square) },
      { id: "ellipse", label: "Ellipse", icon: icon(Circle) },
      { id: "arc", label: "Arc", icon: <PathIcon d="M5 20C5 11 11 5 20 5" /> },
      { id: "polygon", label: "Polygon", icon: icon(Pentagon) },
      { id: "cloud", label: "Cloud", icon: icon(Cloud) },
      { id: "line", label: "Line", icon: icon(Slash) },
      { id: "polyline", label: "Polyline", icon: <PathIcon d="M3 17l6-6 4 4 8-8" /> },
      { id: "arrow", label: "Arrow", icon: icon(MoveUpRight) },
      { id: "eraser", label: "Eraser", icon: icon(Eraser) },
    ],
  },
  {
    id: "insert",
    label: "Insert",
    icon: SquareArrowDownRight,
    tools: [
      { id: "select", label: "Select and move", icon: icon(MousePointer2) },
      { id: "stamp", label: "Stamp", icon: icon(StampIcon) },
      { id: "signature", label: "Signature", icon: icon(SignatureIcon) },
      { id: "eraser", label: "Eraser", icon: icon(Eraser) },
    ],
  },
];

const MARK_LABEL: Record<MarkupStyle, string> = { highlight: "Highlight", underline: "Underline", strike: "Strikethrough", squiggly: "Squiggly" };

/** Eraser widths, in points. */
const ERASER_SIZES = [
  { id: "8", label: "Small" },
  { id: "16", label: "Medium" },
  { id: "32", label: "Large" },
] as const;

/** A highlighter pen stroke's width, in points: about a line of body text. */
const MARKER_WIDTH = 12;

const KIND_LABEL: Record<Exclude<EditItem["kind"], "markup">, string> = {
  text: "Text",
  rect: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  poly: "Polyline",
  comment: "Comment",
  ink: "Drawing",
  image: "Image",
  stamp: "Stamp",
};

const STROKES = [
  { id: "1", label: "Thin" },
  { id: "2", label: "Medium" },
  { id: "4", label: "Thick" },
] as const;

/** A new picture's longest side, in points (about 7 cm): big enough to see, small enough to move into place. */
const IMAGE_SIDE = 200;

/** On-screen copies of inserted pictures, keyed by their bytes, so undo and redraws reuse one URL each. */
const imageUrls = new WeakMap<ArrayBuffer, string>();

/** Each saved signature's bytes, made once so every copy placed is stored in the PDF once. */
const signatureBytes = new Map<string, ArrayBuffer>();

function bytesOf(signature: Signature): ArrayBuffer {
  let bytes = signatureBytes.get(signature.url);
  if (!bytes) {
    bytes = Uint8Array.from(atob(signature.url.slice(signature.url.indexOf(",") + 1)), (c) => c.charCodeAt(0)).buffer;
    signatureBytes.set(signature.url, bytes);
    imageUrls.set(bytes, signature.url);
  }
  return bytes;
}

/** A placed signature's longest side, in points (about 5 cm): a usual signature size. */
const SIGNATURE_SIDE = 150;

const TEXT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

const ALIGNS: { id: TextAlign; label: string; icon: LucideIcon }[] = [
  { id: "left", label: "Align left", icon: AlignLeft },
  { id: "center", label: "Align center", icon: AlignCenter },
  { id: "right", label: "Align right", icon: AlignRight },
];

const OPACITIES = [1, 0.75, 0.5, 0.25];

const DEFAULT_TEXT: TextStyle = {
  font: "sans",
  size: 12,
  bold: false,
  italic: false,
  underline: false,
  color: "#000000",
  background: null,
  align: "left",
  opacity: 1,
};

const iconButton = "rounded-md p-2 text-[color:var(--text-muted)] hover:text-[color:var(--text)] aria-pressed:bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] aria-pressed:text-[color:var(--text)]";

function Divider() {
  return <span aria-hidden className="hidden h-6 w-px self-center bg-[color:var(--border)] sm:block" />;
}

/** What a click without a drag adds, in points, so every tool works with a single click or Enter. */
const DEFAULT_BOX: Record<DragTool, [number, number]> = {
  highlight: [150, 16],
  rect: [120, 80],
  ellipse: [100, 100],
  arc: [120, 80],
  cloud: [140, 90],
  line: [120, 0],
  arrow: [120, 0],
};

let measureChars: CanvasRenderingContext2D | null = null;

/** Widths for splitting the PDF's text into letters; a sans font is close enough to tell wide letters from narrow. */
function charWidth(text: string): number {
  measureChars ??= document.createElement("canvas").getContext("2d");
  if (!measureChars) return text.length;
  measureChars.font = "10px Helvetica, Arial, sans-serif";
  return measureChars.measureText(text).width;
}

/** On-screen page width the page image is drawn for. Sharp at full panel width without huge canvases. */
const PAGE_PIXELS = 1100;

type Doc =
  | { status: "none" }
  | { status: "opening" }
  | { status: "ready"; renderer: PdfRenderer; pages: number }
  | { status: "error"; error: string };

/** The page drawn on screen: its picture, size in points, and its own text split into letters for text marks. */
type View = { index: number; url: string; width: number; height: number; chars: Char[] };

type Drag =
  | { mode: "draw"; start: Point; now: Point }
  /** Freehand: the points live in a ref so fast pointer moves between renders aren't lost; `count` re-renders. */
  | { mode: "ink"; count: number }
  /** Selecting the page's own text, as letter positions in `view.chars`. */
  | { mode: "mark"; from: number; to: number }
  /** Erasing: what was there before, so the whole sweep undoes in one step. */
  | { mode: "erase"; before: Item[] }
  | { mode: "move" | "resize"; id: number; start: Point; before: Item[]; moved: boolean };

type Job = { status: "idle" } | { status: "working"; progress: EditProgress } | { status: "done"; bytes: Uint8Array } | { status: "error"; error: string };

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";
const textareaClass =
  "w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:outline-none";

let measureCtx: CanvasRenderingContext2D | null = null;

/** The text's width in points, measured with the closest screen font. */
function textWidth(line: string, style: TextStyle): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return line.length * style.size * 0.6;
  measureCtx.font = `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}${style.size}px ${PDF_FONT_CSS[style.font]}`;
  return measureCtx.measureText(line).width;
}

/** The box an item covers, for hit areas and the selection outline. */
function bounds(item: EditItem): { x: number; y: number; width: number; height: number } {
  switch (item.kind) {
    case "text": {
      const lines = item.text.split("\n");
      const width = Math.max(item.size, ...lines.map((l) => textWidth(l, item)));
      return { x: item.x, y: item.y, width, height: lines.length * item.size * LINE_HEIGHT };
    }
    case "comment":
      return { x: item.x, y: item.y, width: COMMENT_SIZE, height: COMMENT_SIZE };
    case "ink": {
      const xs = item.points.map((p) => p[0]);
      const ys = item.points.map((p) => p[1]);
      const pad = item.stroke / 2;
      return { x: item.x + Math.min(...xs) - pad, y: item.y + Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + 2 * pad, height: Math.max(...ys) - Math.min(...ys) + 2 * pad };
    }
    case "line":
      return { x: Math.min(item.x, item.x2), y: Math.min(item.y, item.y2), width: Math.abs(item.x2 - item.x), height: Math.abs(item.y2 - item.y) };
    case "poly": {
      const xs = item.points.map((p) => item.x + p[0]);
      const ys = item.points.map((p) => item.y + p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }
    case "markup": {
      const left = Math.min(...item.rects.map((b) => b.x));
      const top = Math.min(...item.rects.map((b) => b.y));
      return {
        x: left,
        y: top,
        width: Math.max(...item.rects.map((b) => b.x + b.width)) - left,
        height: Math.max(...item.rects.map((b) => b.y + b.height)) - top,
      };
    }
    default:
      return item;
  }
}

function describe(item: EditItem): string {
  if (item.kind === "markup") return MARK_LABEL[item.style];
  if (item.kind === "ink") return item.marker ? "Highlighter" : "Drawing";
  if (item.kind === "line") return item.arrow ? "Arrow" : item.curve ? "Arc" : "Line";
  if (item.kind === "poly") return item.closed ? "Polygon" : "Polyline";
  if (item.kind === "rect" && item.cloud) return "Cloud";
  if (item.kind === "stamp") return `Stamp: ${stampName(item)}`;
  if (item.kind === "text" || item.kind === "comment") {
    const words = item.text.trim().replace(/\s+/g, " ");
    return `${KIND_LABEL[item.kind]}: ${words ? (words.length > 30 ? `${words.slice(0, 30)}…` : words) : "empty"}`;
  }
  return KIND_LABEL[item.kind];
}

/** Text and comments with nothing typed in are dropped rather than saved. */
const isEmpty = (item: EditItem) => (item.kind === "text" || item.kind === "comment") && !item.text.trim();

/** One line of a text mark on screen, matching how the saved annotation draws it. */
function MarkLook({ style, box: { x, y, width: w, height: h }, color }: { style: MarkupStyle; box: Box; color: string }) {
  const hitArea = <rect x={x} y={y} width={w} height={h} fill="transparent" />;
  if (style === "highlight") return <rect x={x} y={y} width={w} height={h} fill={color} style={{ mixBlendMode: "multiply" }} />;
  const thickness = Math.max(0.5, h * 0.07);
  if (style !== "squiggly") {
    const ly = y + h * MARK_LINE_AT[style];
    return (
      <>
        {hitArea}
        <line x1={x} y1={ly} x2={x + w} y2={ly} stroke={color} strokeWidth={thickness} strokeLinecap="round" />
      </>
    );
  }
  const step = h / 6;
  const base = y + h * MARK_LINE_AT.squiggly;
  const points = [`${x},${base}`];
  for (let i = 1, px = x + step; px <= x + w + 0.01; i++, px += step) points.push(`${Math.min(px, x + w)},${base + (i % 2 ? -1 : 1) * h * 0.05}`);
  return (
    <>
      {hitArea}
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function ItemShape({ item, hitArea }: { item: Item; hitArea: boolean }) {
  const hit = hitArea ? "all" : "none";
  switch (item.kind) {
    case "text": {
      const box = bounds(item);
      const anchor = ({ left: "start", center: "middle", right: "end" } as const)[item.align];
      const anchorX = item.x + { left: 0, center: box.width / 2, right: box.width }[item.align];
      return (
        <g pointerEvents={hit}>
          <rect {...box} fill={item.background ?? "transparent"} opacity={item.opacity} />
          <text
            y={item.y + item.size * TEXT_ASCENT[item.font]}
            fontFamily={PDF_FONT_CSS[item.font]}
            fontSize={item.size}
            fontWeight={item.bold ? "bold" : "normal"}
            fontStyle={item.italic ? "italic" : "normal"}
            textDecoration={item.underline ? "underline" : undefined}
            textAnchor={anchor}
            fill={item.color}
            opacity={item.opacity}
            style={{ whiteSpace: "pre" }}
          >
            {item.text.split("\n").map((line, i) => (
              <tspan key={i} x={anchorX} dy={i ? item.size * LINE_HEIGHT : 0}>
                {line || " "}
              </tspan>
            ))}
          </text>
          {!item.text.trim() && <rect {...box} fill="none" stroke="currentColor" strokeDasharray="3 2" strokeWidth={0.75} opacity={0.6} />}
        </g>
      );
    }
    case "markup":
      return (
        <g pointerEvents={hit}>
          {item.rects.map((b, i) => (
            <MarkLook key={i} style={item.style} box={b} color={item.color} />
          ))}
        </g>
      );
    case "rect":
      return item.cloud ? (
        <path d={pathD(cloudPath(item))} fill={item.fill ?? "transparent"} stroke={item.color} strokeWidth={item.stroke} strokeLinejoin="round" pointerEvents={hit} />
      ) : (
        <rect x={item.x} y={item.y} width={item.width} height={item.height} fill={item.fill ?? "transparent"} stroke={item.color} strokeWidth={item.stroke} pointerEvents={hit} />
      );
    case "poly": {
      const d = pathD(polyPath(item));
      return (
        <g pointerEvents={hit} strokeLinecap="round" strokeLinejoin="round">
          <path d={d} fill={item.closed ? "transparent" : "none"} stroke="transparent" strokeWidth={Math.max(10, item.stroke)} />
          <path d={d} fill={item.closed ? (item.fill ?? "none") : "none"} stroke={item.color} strokeWidth={item.stroke} />
        </g>
      );
    }
    case "ellipse":
      return (
        <ellipse
          cx={item.x + item.width / 2}
          cy={item.y + item.height / 2}
          rx={item.width / 2}
          ry={item.height / 2}
          fill={item.fill ?? "transparent"}
          stroke={item.color}
          strokeWidth={item.stroke}
          pointerEvents={hit}
        />
      );
    case "line": {
      const { stroke, head } = linePaths(item);
      const d = pathD(stroke);
      return (
        <g pointerEvents={hit} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* A wide invisible stroke so thin lines are easy to grab. */}
          <path d={d} stroke="transparent" strokeWidth={Math.max(10, item.stroke)} />
          <path d={d} stroke={item.color} strokeWidth={item.stroke} />
          {head && <path d={pathD(head)} fill={item.color} stroke="none" />}
        </g>
      );
    }
    case "image": {
      // Drawn at its own shape around the box's centre, then turned to fill the box.
      const sideways = item.rotation % 180 !== 0;
      const [w, h] = sideways ? [item.height, item.width] : [item.width, item.height];
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      return (
        <g pointerEvents={hit}>
          <rect x={item.x} y={item.y} width={item.width} height={item.height} fill="transparent" />
          <image
            href={imageUrls.get(item.bytes)}
            x={cx - w / 2}
            y={cy - h / 2}
            width={w}
            height={h}
            preserveAspectRatio="none"
            transform={`rotate(${item.rotation} ${cx} ${cy})`}
          />
        </g>
      );
    }
    case "ink": {
      const [first, ...rest] = item.points;
      // A lone point gets a zero-length segment so its round cap shows as a dot.
      const d = `M${item.x + first[0]} ${item.y + first[1]}` + (rest.length ? rest : [first]).map(([dx, dy]) => `L${item.x + dx} ${item.y + dy}`).join("");
      return (
        <g pointerEvents={hit} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={d} stroke="transparent" strokeWidth={Math.max(10, item.stroke)} />
          <path d={d} stroke={item.color} strokeWidth={item.stroke} style={item.marker ? { mixBlendMode: "multiply" } : undefined} />
        </g>
      );
    }
    case "stamp":
      return (
        <g pointerEvents={hit}>
          <StampDrawing stamp={item} />
        </g>
      );
    case "comment":
      return (
        <g pointerEvents={hit}>
          <rect x={item.x} y={item.y} width={COMMENT_SIZE} height={COMMENT_SIZE} rx={3} fill="rgb(255 217 51)" stroke="rgb(150 120 0)" strokeWidth={0.75} />
          {[6, 10, 14].map((dy) => (
            <line key={dy} x1={item.x + 4} y1={item.y + dy} x2={item.x + COMMENT_SIZE - 4} y2={item.y + dy} stroke="rgb(150 120 0)" strokeWidth={1} />
          ))}
        </g>
      );
  }
}

export default function PdfEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Doc>({ status: "none" });
  const [pageIndex, setPageIndex] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ink, setInk] = useState("#000000");
  const [marker, setMarker] = useState("#ffeb5a");
  /** Colour for underline, strikethrough and squiggly marks. */
  const [lineMark, setLineMark] = useState("#e74c3c");
  const [tab, setTab] = useState<Tab>("annotate");
  const [markHint, setMarkHint] = useState(false);
  const [eraserSize, setEraserSize] = useState<(typeof ERASER_SIZES)[number]["id"]>("16");
  /** Where the eraser is over the page, to draw its outline in place of the pointer. */
  const [hover, setHover] = useState<Point | null>(null);
  /** Corners placed so far for a polyline or polygon being drawn. */
  const [polyPts, setPolyPts] = useState<Point[] | null>(null);
  const [fill, setFill] = useState<string | null>(null);
  const [stroke, setStroke] = useState<(typeof STROKES)[number]["id"]>("2");
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [job, setJob] = useState<Job>({ status: "idle" });
  const past = useRef<Item[][]>([]);
  /** Undone states, for Redo; any new change clears it. */
  const future = useRef<Item[][]>([]);
  const nextId = useRef(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const cancelJob = useRef(() => {});
  /** Set when a new text or comment is added, so its text box takes focus as soon as it appears. */
  const focusNote = useRef(false);
  const inkPoints = useRef<Point[]>([]);
  const imageInput = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  /** The stamp the Stamp tool places next. */
  const [stamp, setStamp] = useState<Stamp>(STANDARD_STAMPS[0]);
  /** The signature the Signature tool places next. */
  const [signature, setSignature] = useState<Signature | null>(null);
  /** Picture URLs made for this PDF, freed when it's closed. */
  const madeUrls = useRef<string[]>([]);

  // Open with pdf.js to draw pages and catch damaged or locked files before any editing.
  useEffect(() => {
    setItems([]);
    setSelectedId(null);
    setPageIndex(0);
    setImageError(null);
    past.current = [];
    future.current = [];
    madeUrls.current.forEach((url) => URL.revokeObjectURL(url));
    madeUrls.current = [];
    if (!file) return setDoc({ status: "none" });
    if (file.size > PDF_MAX_BYTES) return setDoc({ status: "error", error: `This file is over ${formatBytes(PDF_MAX_BYTES)}, too big to process in the browser.` });
    let cancelled = false;
    let opened: PdfRenderer | null = null;
    setDoc({ status: "opening" });
    file
      .arrayBuffer()
      .then((buffer) => (cancelled ? null : openPdfRenderer(new Uint8Array(buffer))))
      .then((r) => {
        if (!r) return;
        if (cancelled) return r.destroy();
        opened = r;
        setDoc({ status: "ready", renderer: r, pages: r.pageCount });
      })
      .catch((err: Error) => !cancelled && setDoc({ status: "error", error: pdfErrorMessage(err.message) }));
    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [file]);

  // Draw the current page.
  useEffect(() => {
    if (doc.status !== "ready") return setView(null);
    let cancelled = false;
    let url: string | null = null;
    // The page's text is optional: if it can't be read, text marks fall back to boxes.
    Promise.all([doc.renderer.size(pageIndex), doc.renderer.thumbnail(pageIndex, PAGE_PIXELS), doc.renderer.textBoxes(pageIndex).catch(() => [])])
      .then(([size, blob, boxes]) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setView({ index: pageIndex, url, ...size, chars: splitChars(boxes, charWidth) });
      })
      .catch((err: Error) => !cancelled && setDoc({ status: "error", error: pdfErrorMessage(err.message) }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, pageIndex]);

  // Any change makes a saved copy out of date.
  useEffect(() => {
    cancelJob.current();
    setJob({ status: "idle" });
  }, [file, items]);

  useEffect(() => () => cancelJob.current(), []);

  useEffect(() => {
    if (!focusNote.current) return;
    focusNote.current = false;
    noteRef.current?.focus();
  });

  // Edits live only in this tab until saved, so warn before leaving with unsaved ones.
  const unsaved = items.some((i) => !isEmpty(i)) && job.status !== "done";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const pageItems = items.filter((i) => i.page === pageIndex);
  const kept = items.filter((i) => !isEmpty(i));
  const badChars = unsupportedCharacters(items.flatMap((i) => (i.kind === "text" ? [i.text.replace(/\n/g, "")] : [])).join(""));
  const editedPages = new Set(kept.map((i) => i.page)).size;

  /** Replaces the items, remembering the old list for Undo unless `record` is false. */
  function change(next: Item[], record = true) {
    if (record) {
      past.current = [...past.current.slice(-99), items];
      future.current = [];
    }
    setItems(next);
  }

  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(items);
    setItems(prev);
    if (!prev.some((i) => i.id === selectedId)) setSelectedId(null);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(items);
    setItems(next);
    if (!next.some((i) => i.id === selectedId)) setSelectedId(null);
  }

  /** Selects an item (or nothing), dropping any text or comment left empty, and shows its style. */
  function select(id: number | null, list = items) {
    const next = list.filter((i) => i.id === id || !isEmpty(i));
    if (next.length !== list.length) setItems(next);
    setSelectedId(id);
    const item = next.find((i) => i.id === id);
    if (!item) return;
    if (item.kind === "text") {
      const { font, size, bold, italic, underline, color, background, align, opacity } = item;
      setTextStyle({ font, size, bold, italic, underline, color, background, align, opacity });
    } else if (item.kind === "markup") (item.style === "highlight" ? setMarker : setLineMark)(item.color);
    else if (item.kind === "ink" && item.marker) setMarker(item.color);
    else if (item.kind !== "comment" && item.kind !== "image" && item.kind !== "stamp") {
      setInk(item.color);
      if (item.kind === "rect" || item.kind === "ellipse" || item.kind === "poly") setFill(item.fill);
      setStroke(String(item.stroke) as (typeof STROKES)[number]["id"]);
    }
  }

  /** Applies a style change to the selected item when it uses that style, and keeps it for new items. */
  function restyle(patch: Partial<{ color: string; fill: string | null; stroke: number }>) {
    if (!selected) return;
    const fits = Object.keys(patch).every((key) => key in selected);
    if (fits) change(items.map((i) => (i.id === selected.id ? ({ ...i, ...patch } as Item) : i)));
  }

  /** Text style changes: kept for new text, and applied to the selected text. */
  function restyleText(patch: Partial<TextStyle>) {
    setTextStyle({ ...textStyle, ...patch });
    if (selected?.kind === "text") change(items.map((i) => (i.id === selected.id ? { ...selected, ...patch } : i)));
  }

  function newItem(kind: "text" | "comment" | DragTool, a: Point, b: Point | null): Item {
    const id = nextId.current++;
    const base = { id, page: pageIndex };
    if (kind === "text") return { ...base, kind, x: a.x, y: a.y, text: "", ...textStyle };
    if (kind === "comment") return { ...base, kind, x: a.x, y: a.y, text: "" };
    const [w, h] = DEFAULT_BOX[kind];
    const end = b ?? { x: a.x + w, y: a.y + h };
    if (kind === "line" || kind === "arrow" || kind === "arc")
      return { ...base, kind: "line", x: a.x, y: a.y, x2: end.x, y2: end.y, color: ink, stroke: Number(stroke), arrow: kind === "arrow", curve: kind === "arc" };
    const box = { x: Math.min(a.x, end.x), y: Math.min(a.y, end.y), width: Math.abs(end.x - a.x), height: Math.abs(end.y - a.y) };
    // A highlight dragged where there's no text to select: one free box.
    if (kind === "highlight") return { ...base, kind: "markup", style: "highlight", rects: [box], color: marker };
    if (kind === "cloud") return { ...base, kind: "rect", ...box, color: ink, fill, stroke: Number(stroke), cloud: true };
    return { ...base, kind, ...box, color: ink, fill, stroke: Number(stroke) };
  }

  function add(item: Item) {
    const list = [...items.filter((i) => !isEmpty(i)), item];
    change(list);
    select(item.id, list);
    // Typing comes next for text and comments.
    focusNote.current = item.kind === "text" || item.kind === "comment";
  }

  /** A freehand stroke from page points, stored as offsets from its first point (to a tenth of a point). */
  function inkItem(points: Point[]): Item {
    const [{ x, y }] = points;
    const round = (v: number) => Math.round(v * 10) / 10;
    const pen = tool === "marker" ? { color: marker, stroke: MARKER_WIDTH, marker: true } : { color: ink, stroke: Number(stroke), marker: false };
    return { id: nextId.current++, page: pageIndex, kind: "ink", x, y, points: points.map((p) => [round(p.x - x), round(p.y - y)]), ...pen };
  }

  /** A polyline or polygon through page points, stored as offsets from its first corner. */
  function polyItem(points: Point[], closed: boolean): Item {
    const [{ x, y }] = points;
    return { id: nextId.current++, page: pageIndex, kind: "poly", x, y, points: points.map((p) => [p.x - x, p.y - y]), closed, color: ink, fill, stroke: Number(stroke) };
  }

  /** Finishes the polyline or polygon being drawn, if it has enough corners; drops it otherwise. */
  function finishPoly(closed = tool === "polygon") {
    // A double-click lands two clicks on one spot, so drop corners that repeat the one before.
    const pts = (polyPts ?? []).filter((p, i, all) => !i || Math.hypot(p.x - all[i - 1].x, p.y - all[i - 1].y) > 1);
    setPolyPts(null);
    if (pts.length >= (closed ? 3 : 2)) add(polyItem(pts, closed));
  }

  /** A text mark over the letters from `from` to `to` on the current page. */
  function markItem(from: number, to: number): Item {
    const style = tool as MarkupStyle;
    return { id: nextId.current++, page: pageIndex, kind: "markup", style, rects: selectionRects(view!.chars, from, to), color: style === "highlight" ? marker : lineMark };
  }

  /**
   * Erases at a point: pen strokes, text marks and unfilled shapes lose just the part under the eraser
   * (splitting in two if it cuts through); anything else under the pointer goes whole.
   */
  function eraseAt(clientX: number, clientY: number, p: Point, list: Item[]): Item[] {
    const hit = document.elementsFromPoint(clientX, clientY).find((el) => el.closest("[data-id]"))?.closest("[data-id]");
    const hitId = hit ? Number(hit.getAttribute("data-id")) : null;
    return list.flatMap((item): Item[] => {
      if (item.page !== pageIndex) return [item];
      if (item.kind === "ink") {
        const pieces = eraseInk(item, p.x, p.y, Number(eraserSize) / 2);
        return pieces.length === 1 && pieces[0] === item ? [item] : pieces.map((piece) => ({ ...piece, id: nextId.current++ }));
      }
      if (item.kind === "markup") {
        const left = eraseMarkup(item, p.x, p.y, Number(eraserSize) / 2);
        return left === item ? [item] : left ? [{ ...left, id: item.id }] : [];
      }
      if (item.kind === "rect" || item.kind === "ellipse" || item.kind === "line" || item.kind === "poly") {
        const pieces = eraseShape(item, p.x, p.y, Number(eraserSize) / 2);
        if (pieces) return pieces.length === 1 && pieces[0] === item ? [item] : pieces.map((piece) => ({ ...piece, id: nextId.current++ }));
      }
      return item.id === hitId ? [] : [item];
    });
  }

  /** Places a picture in the middle of the current page, selected so it can be moved and resized straight away. */
  async function addImage(picked: File) {
    if (!view) return;
    setImageError(null);
    try {
      const [{ bytes, type }, size] = await Promise.all([prepareImage(picked), imageSize(picked)]);
      const url = URL.createObjectURL(new Blob([bytes], { type: type === "png" ? "image/png" : "image/jpeg" }));
      madeUrls.current.push(url);
      imageUrls.set(bytes, url);
      const scale = Math.min(IMAGE_SIDE / Math.max(size.width, size.height), (view.width * 0.9) / size.width, (view.height * 0.9) / size.height);
      const width = size.width * scale;
      const height = size.height * scale;
      setTool("select");
      add({ id: nextId.current++, page: pageIndex, kind: "image", x: (view.width - width) / 2, y: (view.height - height) / 2, width, height, rotation: 0, bytes, type });
    } catch {
      setImageError(`“${picked.name}” couldn't be read as an image. Try a PNG or JPG.`);
    }
  }

  /** A signature centred on a point of the current page. */
  function signatureItem(sig: Signature, at: Point): Item {
    const scale = SIGNATURE_SIDE / Math.max(sig.width, sig.height);
    const [width, height] = [sig.width * scale, sig.height * scale];
    return { id: nextId.current++, page: pageIndex, kind: "image", x: at.x - width / 2, y: at.y - height / 2, width, height, rotation: 0, bytes: bytesOf(sig), type: "png" };
  }

  /** A stamp centred on a point of the current page, at its natural size. */
  function stampItem(look: Stamp, at: Point): Item {
    const { width, height } = stampSize(look, stampWidthAt1);
    return { id: nextId.current++, page: pageIndex, kind: "stamp", x: at.x - width / 2, y: at.y - height / 2, width, height, ...look };
  }

  /** Turns the selected picture a quarter, keeping its centre where it was. */
  function rotateImage(by: 90 | 270) {
    if (selected?.kind !== "image") return;
    const { x, y, width, height, rotation } = selected;
    const turned = {
      ...selected,
      rotation: ((rotation + by) % 360) as ImageRotation,
      x: x + (width - height) / 2,
      y: y + (height - width) / 2,
      width: height,
      height: width,
    };
    change(items.map((i) => (i.id === selected.id ? turned : i)));
  }

  function pointAt(e: { clientX: number; clientY: number }): Point {
    const r = svgRef.current!.getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
    return { x: clamp(((e.clientX - r.left) * view!.width) / r.width, view!.width), y: clamp(((e.clientY - r.top) * view!.height) / r.height, view!.height) };
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (!view || e.button !== 0) return;
    const p = pointAt(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "select") {
      const target = (e.target as Element).closest("[data-id]");
      const id = target ? Number(target.getAttribute("data-id")) : null;
      select(id);
      if (id !== null) setDrag({ mode: target?.hasAttribute("data-resize") ? "resize" : "move", id, start: p, before: items, moved: false });
      return;
    }
    if (tool === "text" || tool === "comment") return add(newItem(tool, p, null));
    // Keep stamping: like the pen, new stamps aren't selected.
    if (tool === "stamp") return change([...items.filter((i) => !isEmpty(i)), stampItem(stamp, p)]);
    if (tool === "signature") return signature && change([...items.filter((i) => !isEmpty(i)), signatureItem(signature, p)]);
    if (isPolyTool(tool)) {
      if (!polyPts) return setPolyPts([p]);
      // Clicking back on the first corner closes a polygon.
      if (tool === "polygon" && polyPts.length >= 3 && Math.hypot(p.x - polyPts[0].x, p.y - polyPts[0].y) < 8) return finishPoly(true);
      return setPolyPts([...polyPts, p]);
    }
    if (tool === "eraser") {
      select(null);
      setItems(eraseAt(e.clientX, e.clientY, p, items));
      return setDrag({ mode: "erase", before: items });
    }
    if (tool === "highlight" || isTextMark(tool)) {
      const at = charAt(view.chars, p.x, p.y);
      setMarkHint(at === null && tool !== "highlight");
      if (at !== null) return setDrag({ mode: "mark", from: at, to: at });
      if (tool !== "highlight") return;
    }
    if (tool === "ink" || tool === "marker") {
      inkPoints.current = [p];
      return setDrag({ mode: "ink", count: 1 });
    }
    setDrag({ mode: "draw", start: p, now: p });
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!view) return;
    const p = pointAt(e);
    if (tool === "eraser" || polyPts) setHover(p);
    if (!drag) return;
    if (drag.mode === "draw") return setDrag({ ...drag, now: p });
    if (drag.mode === "mark") {
      const to = charAt(view.chars, p.x, p.y);
      return to !== null && to !== drag.to && setDrag({ ...drag, to });
    }
    if (drag.mode === "erase") return setItems(eraseAt(e.clientX, e.clientY, p, items));
    if (drag.mode === "ink") {
      // Coalesced events carry the in-between positions a fast stroke would otherwise skip.
      for (const ev of e.nativeEvent.getCoalescedEvents?.() ?? [e]) {
        const q = pointAt(ev);
        const last = inkPoints.current[inkPoints.current.length - 1];
        if (Math.hypot(q.x - last.x, q.y - last.y) >= 0.75) inkPoints.current.push(q);
      }
      return setDrag({ mode: "ink", count: inkPoints.current.length });
    }
    const orig = drag.before.find((i) => i.id === drag.id);
    // Text marks belong to the text under them, so they stay put.
    if (!orig || orig.kind === "markup") return;
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    let moved: Item;
    // Pictures keep their shape when resized.
    if (drag.mode === "resize" && (orig.kind === "image" || orig.kind === "stamp")) {
      const width = Math.max(8, orig.width + dx);
      moved = { ...orig, width, height: (width * orig.height) / orig.width };
    } else if (drag.mode === "resize" && "width" in orig) moved = { ...orig, width: Math.max(4, orig.width + dx), height: Math.max(4, orig.height + dy) };
    else if (drag.mode === "resize" && orig.kind === "line") moved = { ...orig, x2: orig.x2 + dx, y2: orig.y2 + dy };
    else moved = { ...orig, x: orig.x + dx, y: orig.y + dy, ...(orig.kind === "line" && { x2: orig.x2 + dx, y2: orig.y2 + dy }) };
    setItems(drag.before.map((i) => (i.id === drag.id ? moved : i)));
    if (!drag.moved) setDrag({ ...drag, moved: true });
  }

  function onPointerUp() {
    if (!drag) return;
    setDrag(null);
    if (drag.mode === "erase") {
      if (items.length !== drag.before.length) {
        past.current = [...past.current.slice(-99), drag.before];
        future.current = [];
      }
      return;
    }
    if (drag.mode === "mark") {
      // Keep marking: like the pen, new marks aren't selected.
      change([...items.filter((i) => !isEmpty(i)), markItem(drag.from, drag.to)]);
      return;
    }
    if (drag.mode === "ink") {
      // Keep drawing: new strokes are added without selecting them.
      change([...items.filter((i) => !isEmpty(i)), inkItem(inkPoints.current)]);
      inkPoints.current = [];
      return;
    }
    if (drag.mode !== "draw") {
      if (drag.moved) {
        past.current = [...past.current.slice(-99), drag.before];
        future.current = [];
      }
      return;
    }
    if (!isDragTool(tool)) return;
    const far = Math.hypot(drag.now.x - drag.start.x, drag.now.y - drag.start.y) > 4;
    add(newItem(tool, drag.start, far ? drag.now : null));
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (!view) return;
    const step = e.shiftKey ? 10 : 1;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (polyPts && (e.key === "Enter" || e.key === "Escape")) {
      e.preventDefault();
      return e.key === "Enter" ? finishPoly() : setPolyPts(null);
    }
    const placeable = tool === "text" || tool === "comment" || tool === "stamp" || tool === "signature" || isDragTool(tool);
    if ((e.key === "Enter" || e.key === " ") && placeable) {
      e.preventDefault();
      if (tool === "stamp") return add(stampItem(stamp, { x: view.width / 2, y: view.height / 2 }));
      if (tool === "signature") return signature && add(signatureItem(signature, { x: view.width / 2, y: view.height / 2 }));
      // Keyboard placement: start near the middle of the page, then move with the arrow keys.
      add(newItem(tool, { x: view.width / 2 - 50, y: view.height / 2 - 20 }, null));
    } else if (selected && selected.kind !== "markup" && e.key in arrows) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      const moved = { ...selected, x: selected.x + dx, y: selected.y + dy, ...(selected.kind === "line" && { x2: selected.x2 + dx, y2: selected.y2 + dy }) };
      change(items.map((i) => (i.id === selected.id ? moved : i)));
    } else if (selected && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      remove(selected.id);
    } else if (e.key === "Escape") select(null);
  }

  function remove(id: number) {
    change(items.filter((i) => i.id !== id));
    setSelectedId(null);
  }

  function goTo(index: number) {
    select(null);
    setPolyPts(null);
    setDrag(null);
    setPageIndex(index);
  }

  function clearFile() {
    if (unsaved && !window.confirm("Remove this PDF? Your edits haven't been saved and will be lost.")) return;
    setFile(null);
  }

  async function save() {
    if (!file || !kept.length || badChars.length) return;
    setSelectedId(null);
    setJob({ status: "working", progress: { phase: "reading" } });
    try {
      const bytes = await file.arrayBuffer();
      const task = runWorkerTask<PdfEditorRequest, EditProgress, Uint8Array>(
        createWorker,
        { bytes, items: kept },
        { transfer: [bytes], onProgress: (progress) => setJob({ status: "working", progress }) },
      );
      cancelJob.current = task.cancel;
      setJob({ status: "done", bytes: await task.result });
    } catch (err) {
      if ((err as Error).message !== "cancelled") setJob({ status: "error", error: pdfErrorMessage((err as Error).message) });
    }
  }

  function switchTab(id: Tab) {
    setTab(id);
    setPolyPts(null);
    setMarkHint(false);
    if (!TABS.find((t) => t.id === id)!.tools.some((t) => t.id === tool)) setTool("select");
  }

  // Tabs pattern: arrow keys move between tabs and show them; Home and End jump to the ends.
  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = TABS[(next + TABS.length) % TABS.length].id;
    switchTab(id);
    document.getElementById(`pdf-tab-${id}`)?.focus();
  }

  // Undo and redo work from anywhere in the editor except inside text fields, which keep their own.
  function onEditorKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!(e.metaKey || e.ctrlKey) || (e.target as Element).closest("textarea, input, select")) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) undo();
    else if ((key === "z" && e.shiftKey) || key === "y") redo();
    else return;
    e.preventDefault();
  }

  const draft =
    drag?.mode === "ink" && inkPoints.current.length
      ? inkItem(inkPoints.current)
      : drag?.mode === "mark"
        ? markItem(drag.from, drag.to)
        : drag?.mode === "draw" && isDragTool(tool)
          ? newItem(tool, drag.start, drag.now)
          : polyPts && hover
            ? polyItem([...polyPts, hover], false)
            : null;
  // Which style controls to show: the selected item's, or the chosen tool's for what it adds next.
  const styleKind: Tool | "image" | null = selected
    ? selected.kind === "markup"
      ? selected.style
      : selected.kind === "ink" && selected.marker
        ? "marker"
        : selected.kind === "line"
          ? selected.arrow
            ? "arrow"
            : selected.curve
              ? "arc"
              : "line"
          : selected.kind === "poly"
            ? selected.closed
              ? "polygon"
              : "polyline"
            : selected.kind === "rect" && selected.cloud
              ? "cloud"
              : selected.kind
    : tool === "select"
      ? null
      : tool;
  const tabTools = TABS.find((t) => t.id === tab)!.tools;
  const outName = file ? file.name.replace(/(\.pdf)?$/i, "-edited.pdf") : "edited.pdf";
  const pages = doc.status === "ready" ? doc.pages : 0;
  const box = selected && selected.page === pageIndex ? bounds(selected) : null;
  const resizable = selected && (selected.kind === "rect" || selected.kind === "ellipse" || selected.kind === "line" || selected.kind === "image" || selected.kind === "stamp");

  return (
    <>
      <InputPanel label="PDF" wide>
        <div className="space-y-5" onKeyDown={onEditorKeyDown}>
          {file ? (
            <SelectedFile file={file} onClear={clearFile} detail={doc.status === "ready" ? plural(doc.pages, "page", "pages") : doc.status === "opening" ? "opening…" : undefined} />
          ) : (
            <FileDrop onFiles={([f]) => setFile(f)} accept="application/pdf,.pdf" what="a PDF" />
          )}

          {doc.status === "error" && <Alert title="Couldn't open this PDF">{doc.error}</Alert>}

          {doc.status === "ready" && (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-x-3 border-b border-[color:var(--border)]">
                  <div role="tablist" aria-label="Tool groups" className="flex" onKeyDown={onTabKeyDown}>
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        id={`pdf-tab-${t.id}`}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        aria-controls="pdf-tools"
                        tabIndex={tab === t.id ? 0 : -1}
                        onClick={() => switchTab(t.id)}
                        className={`-mb-px flex flex-col items-center gap-1 border-b-2 px-4 pb-2 pt-1 text-xs ${
                          tab === t.id
                            ? "border-[color:var(--accent)] font-medium text-[color:var(--accent)]"
                            : "border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                        }`}
                      >
                        <t.icon aria-hidden className="h-5 w-5" />
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2 pb-2">
                    <Button icon={Undo2} onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (Ctrl+Z)" />
                    <Button icon={Redo2} onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" />
                    <Button
                      icon={RotateCcw}
                      onClick={() => {
                        change([]);
                        setSelectedId(null);
                      }}
                      disabled={!items.length}
                      title="Remove all edits on every page. Undo brings them back."
                    >
                      Reset
                    </Button>
                    <Button variant="primary" icon={Save} onClick={save} disabled={!kept.length || badChars.length > 0 || job.status === "working"}>
                      Save PDF
                    </Button>
                  </div>
                </div>

                <div id="pdf-tools" role="tabpanel" aria-labelledby={`pdf-tab-${tab}`} className="flex flex-wrap items-center gap-2">
                  <div role="radiogroup" aria-label="Tool" className="flex flex-wrap items-center gap-1">
                    {tabTools.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={tool === t.id}
                        aria-label={t.label}
                        title={t.label}
                        onClick={() => {
                          setTool(t.id);
                          setMarkHint(false);
                          setPolyPts(null);
                          if (t.id !== "select") select(null);
                        }}
                        className={`rounded-md p-2 ${
                          tool === t.id
                            ? "bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] text-[color:var(--text)] ring-1 ring-[color:var(--accent)]"
                            : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                        }`}
                      >
                        {t.icon}
                      </button>
                    ))}
                  </div>
                  {tab === "insert" && (
                    <>
                      <button
                        type="button"
                        aria-label="Add image"
                        title="Add image: a logo or photo"
                        onClick={() => imageInput.current?.click()}
                        className="-ml-1 rounded-md p-2 text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                      >
                        <ImagePlus aria-hidden className="h-4 w-4" />
                      </button>

                      <input
                        ref={imageInput}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const picked = e.target.files?.[0];
                          e.target.value = "";
                          if (picked) void addImage(picked);
                        }}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Style for the selected item, or for what the chosen tool adds next. */}
              <div className="flex min-h-9 flex-wrap items-center gap-x-5 gap-y-3">
                {styleKind === "text" && (
                  <div role="toolbar" aria-label="Text style" className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label className="flex items-center gap-2">
                      <Type aria-hidden className="h-4 w-4 text-[color:var(--text-muted)]" />
                      <span className="sr-only">Font</span>
                      <Select value={textStyle.font} onChange={(e) => restyleText({ font: e.target.value as PdfFont })} className="w-28">
                        {PDF_FONT_OPTIONS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex items-center gap-2">
                      <span aria-hidden className="text-xs font-semibold text-[color:var(--text-muted)]">
                        <span className="text-[0.6rem]">T</span>T
                      </span>
                      <span className="sr-only">Size</span>
                      <Select value={String(textStyle.size)} onChange={(e) => restyleText({ size: Number(e.target.value) })} className="w-20">
                        {TEXT_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <Divider />
                    <div className="flex items-center gap-1">
                      {(
                        [
                          ["bold", "Bold", Bold],
                          ["italic", "Italic", Italic],
                          ["underline", "Underline", Underline],
                        ] as const
                      ).map(([key, label, Icon]) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={textStyle[key]}
                          aria-label={label}
                          title={label}
                          onClick={() => restyleText({ [key]: !textStyle[key] })}
                          className={iconButton}
                        >
                          <Icon aria-hidden className="h-4 w-4" />
                        </button>
                      ))}
                      <ColorPicker label="Text color" icon={Baseline} rows={SWATCH_ROWS} value={textStyle.color} onChange={(v) => v && restyleText({ color: v })} />
                      <ColorPicker
                        label="Background"
                        icon={PaintBucket}
                        allowNone
                        rows={SWATCH_ROWS}
                        value={textStyle.background}
                        onChange={(v) => restyleText({ background: v })}
                      />
                    </div>
                    <Divider />
                    <div role="group" aria-label="Alignment" className="flex items-center gap-1">
                      {ALIGNS.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          aria-pressed={textStyle.align === a.id}
                          aria-label={a.label}
                          title={a.label}
                          onClick={() => restyleText({ align: a.id })}
                          className={iconButton}
                        >
                          <a.icon aria-hidden className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                    <Divider />
                    <label className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-4 w-4 rounded-sm border border-[color:var(--border)]"
                        style={{ background: "repeating-conic-gradient(#c8c8c8 0 25%, #ffffff 0 50%) 0 0 / 6px 6px" }}
                      />
                      <span className="sr-only">Opacity</span>
                      <Select value={String(textStyle.opacity)} onChange={(e) => restyleText({ opacity: Number(e.target.value) })} className="w-24">
                        {OPACITIES.map((o) => (
                          <option key={o} value={o}>
                            {o * 100}%
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                )}
                {(styleKind === "highlight" || styleKind === "marker") && (
                  <ColorPicker
                    label="Color"
                    rows={SWATCH_ROWS}
                    value={marker}
                    onChange={(v) => {
                      if (!v) return;
                      setMarker(v);
                      restyle({ color: v });
                    }}
                  />
                )}
                {styleKind && isTextMark(styleKind) && (
                  <ColorPicker
                    label="Color"
                    rows={SWATCH_ROWS}
                    value={lineMark}
                    onChange={(v) => {
                      if (!v) return;
                      setLineMark(v);
                      restyle({ color: v });
                    }}
                  />
                )}
                {(styleKind === "highlight" || (styleKind && isTextMark(styleKind))) && !selected && (
                  <p className={`text-sm ${markHint ? "text-[color:var(--error)]" : muted}`}>
                    {markHint
                      ? "No text there. These marks go on the PDF's own text; scanned pages have none."
                      : styleKind === "highlight"
                        ? "Drag across text to highlight it. Where there's no text, drag a box."
                        : "Drag across the PDF's text to mark it."}
                  </p>
                )}
                {isPolyTool(tool) && !selected && (
                  <p className={`text-sm ${muted}`}>
                    Click to add each corner. Double-click or press Enter to finish{tool === "polygon" && ", or click the first corner to close it"}. Esc
                    cancels.
                  </p>
                )}
                {styleKind === "marker" && !selected && <p className={`text-sm ${muted}`}>Drag to draw over anything, like a highlighter pen.</p>}
                {styleKind === "eraser" && (
                  <>
                    <SegmentedControl label="Eraser size" options={ERASER_SIZES} value={eraserSize} onChange={setEraserSize} />
                    <p className={`text-sm ${muted}`}>
                      Rubs out parts of pen strokes, text marks and shape outlines. Text boxes, filled shapes, images, stamps and comments are removed whole.
                    </p>
                  </>
                )}
                {styleKind && (isDragTool(styleKind) || isPolyTool(styleKind) || styleKind === "ink") && styleKind !== "highlight" && (
                  <ColorPicker
                    label={styleKind === "ink" ? "Color" : "Outline"}
                    rows={SWATCH_ROWS}
                    value={ink}
                    onChange={(v) => {
                      if (!v) return;
                      setInk(v);
                      restyle({ color: v });
                    }}
                  />
                )}
                {(styleKind === "rect" || styleKind === "ellipse" || styleKind === "cloud" || styleKind === "polygon") && (
                  <ColorPicker
                    label="Fill"
                    rows={SWATCH_ROWS}
                    allowNone
                    value={fill}
                    onChange={(v) => {
                      setFill(v);
                      restyle({ fill: v });
                    }}
                  />
                )}
                {styleKind && (isDragTool(styleKind) || isPolyTool(styleKind) || styleKind === "ink") && styleKind !== "highlight" && (
                  <SegmentedControl
                    label="Thickness"
                    options={STROKES}
                    value={stroke}
                    onChange={(v) => {
                      setStroke(v);
                      restyle({ stroke: Number(v) });
                    }}
                  />
                )}
                {!styleKind && <p className={`text-sm ${muted}`}>Pick a tool, then click or drag on the page. Select an item to move, restyle or delete it.</p>}
                {tool === "stamp" && <StampPicker value={stamp} onChange={setStamp} />}
                {tool === "signature" && <SignaturePicker value={signature} onChange={setSignature} />}
                {styleKind === "stamp" && tool !== "stamp" && <p className={`text-sm ${muted}`}>Drag to move. Drag the corner handle to resize.</p>}
                {styleKind === "image" && (
                  <>
                    <div role="group" aria-label="Rotate" className="flex items-center gap-1">
                      <button type="button" aria-label="Rotate left" title="Rotate left" onClick={() => rotateImage(270)} className={iconButton}>
                        <RotateCcwSquare aria-hidden className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label="Rotate right" title="Rotate right" onClick={() => rotateImage(90)} className={iconButton}>
                        <RotateCwSquare aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                    <p className={`text-sm ${muted}`}>Drag to move. Drag the corner handle to resize.</p>
                  </>
                )}
                {styleKind === "ink" && !selected && <p className={`text-sm ${muted}`}>Drag on the page to draw.</p>}
                {styleKind === "comment" && !selected && <p className={`text-sm ${muted}`}>Click where the note should go, then type it.</p>}
                {selected && (
                  <>
                    <Divider />
                    <button type="button" aria-label={`Delete ${describe(selected)}`} title="Delete" onClick={() => remove(selected.id)} className={`${iconButton} hover:text-[color:var(--error)]`}>
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              {selected && (selected.kind === "text" || selected.kind === "comment") && (
                <Field label={selected.kind === "text" ? "Text" : "Comment"} htmlFor="pdf-edit-text">
                  <textarea
                    id="pdf-edit-text"
                    ref={noteRef}
                    rows={3}
                    value={selected.text}
                    onChange={(e) =>
                      change(
                        items.map((i) => (i.id === selected.id ? ({ ...i, text: e.target.value } as Item) : i)),
                        false,
                      )
                    }
                    placeholder={selected.kind === "text" ? "Type the text to add" : "Type your note"}
                    className={textareaClass}
                  />
                </Field>
              )}

              {imageError && <Alert title="Couldn't add the image">{imageError}</Alert>}

              {badChars.length > 0 && (
                <Alert title="Some characters can't be added as text">
                  The built-in PDF fonts can&apos;t draw {badChars.map((c) => `“${c}”`).join(" ")}. Remove them, or put them in a comment, which can hold any
                  text.
                </Alert>
              )}

              <div className="grid gap-5 lg:grid-cols-[1fr_14rem]">
                <div className="min-w-0 space-y-3">
                  <div className="flex items-center justify-center gap-3 text-sm">
                    <Button size="sm" icon={ChevronLeft} onClick={() => goTo(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Previous page" />
                    <span aria-live="polite">
                      Page {pageIndex + 1} of {pages}
                    </span>
                    <Button size="sm" icon={ChevronRight} onClick={() => goTo(pageIndex + 1)} disabled={pageIndex >= pages - 1} aria-label="Next page" />
                  </div>

                  <div className="mx-auto w-full max-w-3xl">
                    {view && view.index === pageIndex ? (
                      <div className="relative border border-[color:var(--border)] bg-white shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL; next/image can't optimise it */}
                        <img src={view.url} alt="" className="block h-auto w-full select-none" draggable={false} />
                        <svg
                          ref={svgRef}
                          viewBox={`0 0 ${view.width} ${view.height}`}
                          preserveAspectRatio="none"
                          tabIndex={0}
                          role="application"
                          aria-label={`Page ${pageIndex + 1}`}
                          aria-describedby="pdf-edit-keys"
                          className={`absolute inset-0 h-full w-full text-[color:var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${
                            tool === "select" ? "cursor-default" : tool === "highlight" || isTextMark(tool) ? "cursor-text" : tool === "eraser" ? "cursor-none" : "cursor-crosshair"
                          } ${tool !== "select" || selected ? "touch-none" : ""}`}
                          onPointerDown={onPointerDown}
                          // Clicking would focus the page after the new text box took focus; typing belongs in the box.
                          onMouseDown={(e) => (tool === "text" || tool === "comment") && e.preventDefault()}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                          onPointerLeave={() => setHover(null)}
                          onDoubleClick={() => polyPts && finishPoly()}
                          onKeyDown={onKeyDown}
                        >
                          {pageItems.map((item) => (
                            <g key={item.id} data-id={item.id} className={tool === "select" ? "cursor-move" : undefined}>
                              <ItemShape item={item} hitArea={tool === "select" || tool === "eraser"} />
                            </g>
                          ))}
                          {draft && <ItemShape item={draft} hitArea={false} />}
                          {tool === "eraser" && hover && (
                            <circle
                              cx={hover.x}
                              cy={hover.y}
                              r={Number(eraserSize) / 2}
                              fill="white"
                              fillOpacity={0.4}
                              stroke="currentColor"
                              strokeWidth={1}
                              pointerEvents="none"
                            />
                          )}
                          {box && (
                            <g pointerEvents="none">
                              <rect x={box.x - 3} y={box.y - 3} width={box.width + 6} height={box.height + 6} fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="4 3" />
                            </g>
                          )}
                          {box && resizable && tool === "select" && (
                            <rect
                              data-id={selected.id}
                              data-resize=""
                              x={(selected.kind === "line" ? selected.x2 : box.x + box.width) - 4}
                              y={(selected.kind === "line" ? selected.y2 : box.y + box.height) - 4}
                              width={8}
                              height={8}
                              fill="white"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              className="cursor-nwse-resize"
                            />
                          )}
                        </svg>
                      </div>
                    ) : (
                      <p className={`py-24 text-center text-sm ${muted}`}>Drawing page…</p>
                    )}
                  </div>
                  <p id="pdf-edit-keys" className="text-xs text-[color:var(--text-muted)]">
                    Keyboard: focus the page, press Enter to add with the chosen tool, arrow keys to move the selected item (Shift for bigger steps), Delete to
                    remove it, Ctrl+Z to undo, Ctrl+Shift+Z to redo. Text marks and drawing need a mouse, pen or touch.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">On this page</h3>
                  {pageItems.length ? (
                    <ul className="space-y-1">
                      {pageItems.map((item) => (
                        <li key={item.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-pressed={item.id === selectedId}
                            onClick={() => {
                              setTool("select");
                              select(item.id);
                            }}
                            className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                              item.id === selectedId ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]" : "hover:bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)]"
                            }`}
                          >
                            {describe(item)}
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${describe(item)}`}
                            title="Delete"
                            onClick={() => remove(item.id)}
                            className="rounded p-1 text-[color:var(--text-muted)] hover:text-[color:var(--error)]"
                          >
                            <Trash2 aria-hidden className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={`text-sm ${muted}`}>Nothing added yet.</p>
                  )}
                  {kept.length > 0 && (
                    <p className="pt-2 text-xs text-[color:var(--text-muted)]">
                      {plural(kept.length, "edit", "edits")} on {plural(editedPages, "page", "pages")} in all.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </InputPanel>

      <OutputPanel
        label="Edited PDF"
        wide
        copyable={false}
        download={job.status === "done" ? { filename: outName, mimeType: "application/pdf", content: job.bytes as Uint8Array<ArrayBuffer> } : undefined}
      >
        <div role="status" aria-live="polite" aria-busy={job.status === "working"}>
          {job.status === "idle" ? (
            <p className={muted}>{file ? "Add text, highlights, shapes or comments, then save." : "Choose a PDF to edit."}</p>
          ) : job.status === "working" ? (
            <TaskProgress
              label={job.progress.phase === "reading" ? "Reading PDF…" : job.progress.phase === "saving" ? "Saving…" : `Adding edit ${job.progress.done + 1} of ${job.progress.total}…`}
              value={job.progress.phase === "editing" ? job.progress.done / job.progress.total : undefined}
              onCancel={() => {
                cancelJob.current();
                setJob({ status: "idle" });
              }}
            />
          ) : job.status === "error" ? (
            <Alert title="Couldn't save the PDF">{job.error}</Alert>
          ) : (
            <div className="space-y-1 font-[family-name:var(--font-ui)]">
              <p className="text-base">
                Saved <span className="font-semibold">{plural(kept.length, "edit", "edits")}</span>
                <span className="text-[color:var(--text-muted)]"> · {formatBytes(job.bytes.length)}</span>
              </p>
              <p className="break-all text-sm text-[color:var(--text-muted)]">{outName}</p>
              <p className="text-sm text-[color:var(--text-muted)]">
                Highlights, text marks, drawings and comments are saved as annotations: they show in your PDF reader&apos;s comments list, and you can still
                edit or delete them there.
              </p>
            </div>
          )}
        </div>
      </OutputPanel>
    </>
  );
}

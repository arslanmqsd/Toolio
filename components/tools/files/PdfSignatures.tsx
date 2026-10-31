"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { Caveat, Dancing_Script, Great_Vibes, Satisfy } from "next/font/google";
import { Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Field from "@/components/ui/Field";
import FileDrop from "@/components/ui/FileDrop";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TextInput from "@/components/ui/TextInput";

const dancing = Dancing_Script({ subsets: ["latin"], weight: "700", preload: false });
const vibes = Great_Vibes({ subsets: ["latin"], weight: "400", preload: false });
const satisfy = Satisfy({ subsets: ["latin"], weight: "400", preload: false });
const caveat = Caveat({ subsets: ["latin"], weight: "600", preload: false });

/** Handwriting fonts for a typed signature. */
const SCRIPTS = [
  { id: "dancing", label: "Dancing Script", font: dancing },
  { id: "vibes", label: "Great Vibes", font: vibes },
  { id: "satisfy", label: "Satisfy", font: satisfy },
  { id: "caveat", label: "Caveat", font: caveat },
] as const;

const MODES = [
  { id: "draw", label: "Draw" },
  { id: "type", label: "Type" },
  { id: "upload", label: "Upload" },
] as const;

const INKS = [
  { color: "#000000", label: "Black" },
  { color: "#1a3d8f", label: "Blue" },
  { color: "#c0392b", label: "Red" },
];

/** The drawing pad's own units; the pad keeps this shape at any width. */
const PAD = { width: 400, height: 160 };
const PAD_STROKE = 3;
/** Pixels per pad unit in the saved picture, so it stays sharp when printed. */
const SCALE = 3;
const TYPE_SIZE = 48;
/** An uploaded picture's longest side, in pixels: plenty for a signature, small enough to keep. */
const UPLOAD_SIDE = 1200;

type Pt = [number, number];

/** A signature as a PNG data URL, with its size in pad units (only the shape matters). */
export interface Signature {
  url: string;
  width: number;
  height: number;
}

/** The strokes cropped to their ink, as a see-through PNG. */
function drawnPng(strokes: Pt[][], color: string): Signature {
  const all = strokes.flat();
  const pad = PAD_STROKE;
  const left = Math.min(...all.map((p) => p[0])) - pad;
  const top = Math.min(...all.map((p) => p[1])) - pad;
  const width = Math.max(...all.map((p) => p[0])) + pad - left;
  const height = Math.max(...all.map((p) => p[1])) + pad - top;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * SCALE);
  canvas.height = Math.ceil(height * SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.translate(-left, -top);
  Object.assign(ctx, { strokeStyle: color, lineWidth: PAD_STROKE, lineCap: "round", lineJoin: "round" });
  for (const [first, ...rest] of strokes) {
    ctx.beginPath();
    ctx.moveTo(...first);
    for (const p of rest.length ? rest : [first]) ctx.lineTo(...p);
    ctx.stroke();
  }
  return { url: canvas.toDataURL("image/png"), width, height };
}

/** The name written in a handwriting font, cropped to its letters, as a see-through PNG. */
async function typedPng(name: string, family: string, color: string): Promise<Signature> {
  const font = `${TYPE_SIZE * SCALE}px ${family}`;
  await document.fonts.load(font, name);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  const m = ctx.measureText(name);
  const pad = 4 * SCALE;
  canvas.width = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight + 2 * pad);
  canvas.height = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 2 * pad);
  // Resizing the canvas resets its state.
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(name, pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent);
  return { url: canvas.toDataURL("image/png"), width: canvas.width / SCALE, height: canvas.height / SCALE };
}

/** A picture of a signature, scaled down if huge, as a PNG. */
async function uploadedPng(file: File): Promise<Signature> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`“${file.name}” couldn't be read as an image. Try a PNG or JPG.`);
  });
  const scale = Math.min(1, UPLOAD_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

const swatchButton =
  "h-7 w-7 rounded-full border-2 border-[color:var(--surface-raised)] ring-1 ring-[color:var(--border)] aria-pressed:ring-2 aria-pressed:ring-[color:var(--accent)]";

/** Draw, type or upload a signature. */
function SignatureDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (signature: Signature) => void }) {
  const [mode, setMode] = useState<"draw" | "type" | "upload">("draw");
  const [color, setColor] = useState(INKS[0].color);
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const [name, setName] = useState("");
  const [script, setScript] = useState<(typeof SCRIPTS)[number]["id"]>("dancing");
  const [upload, setUpload] = useState<Signature | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drawing = useRef(false);
  const nameId = useId();
  const family = SCRIPTS.find((s) => s.id === script)!.font;

  function at(pad: Element, { clientX, clientY }: { clientX: number; clientY: number }): Pt {
    const r = pad.getBoundingClientRect();
    return [((clientX - r.left) * PAD.width) / r.width, ((clientY - r.top) * PAD.height) / r.height];
  }

  function down(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    setStrokes([...strokes, [at(e.currentTarget, e)]]);
  }

  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const pad = e.currentTarget;
    // Coalesced events carry the in-between positions a fast stroke would otherwise skip.
    const added = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]).map((ev) => at(pad, ev));
    setStrokes((all) => [...all.slice(0, -1), [...all[all.length - 1], ...added]]);
  }

  async function pick(file: File) {
    setError(null);
    try {
      setUpload(await uploadedPng(file));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const ready = mode === "draw" ? strokes.length > 0 : mode === "type" ? name.trim().length > 0 : !!upload;

  async function create() {
    setError(null);
    try {
      onCreate(mode === "draw" ? drawnPng(strokes, color) : mode === "type" ? await typedPng(name.trim(), family.style.fontFamily, color) : upload!);
      setStrokes([]);
      setUpload(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New signature" description="It's kept in this browser, ready to place on any PDF.">
      <div className="space-y-4">
        <SegmentedControl label="How to sign" variant="tabs" options={MODES} value={mode} onChange={setMode} />
        {mode === "draw" && (
          <div className="space-y-2">
            <svg
              viewBox={`0 0 ${PAD.width} ${PAD.height}`}
              role="img"
              aria-label={strokes.length ? "Your drawn signature" : "Signature pad: draw with a mouse, pen or finger"}
              className="block aspect-[5/2] w-full cursor-crosshair touch-none rounded-md border border-[color:var(--border)] bg-white"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => (drawing.current = false)}
              onPointerCancel={() => (drawing.current = false)}
            >
              <line x1={24} x2={PAD.width - 24} y1={PAD.height - 36} y2={PAD.height - 36} stroke="#d4d4d4" strokeDasharray="6 4" />
              {strokes.map((s, i) => (
                <path
                  key={i}
                  d={`M${s[0]}` + (s.length > 1 ? s.slice(1) : s).map((p) => `L${p}`).join("")}
                  fill="none"
                  stroke={color}
                  strokeWidth={PAD_STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          </div>
        )}
        {mode === "type" && (
          <div className="space-y-3">
            <Field label="Your name" htmlFor={nameId}>
              <TextInput id={nameId} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus />
            </Field>
            <div role="group" aria-label="Handwriting" className="grid grid-cols-2 gap-2">
              {SCRIPTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={script === s.id}
                  aria-label={s.label}
                  title={s.label}
                  onClick={() => setScript(s.id)}
                  className={`h-14 truncate rounded-md border border-[color:var(--border)] bg-white px-2 text-2xl hover:border-[color:var(--accent)] aria-pressed:border-[color:var(--accent)] aria-pressed:ring-2 aria-pressed:ring-[color:var(--accent)] ${s.font.className}`}
                  style={{ color }}
                >
                  {name.trim() || "Your name"}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === "upload" &&
          (upload ? (
            <div className="space-y-2">
              <div className="flex h-28 items-center justify-center rounded-md border border-[color:var(--border)] bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL; next/image can't optimise it */}
                <img src={upload.url} alt="Your uploaded signature" className="max-h-full max-w-full object-contain" />
              </div>
              <Button size="sm" onClick={() => setUpload(null)}>
                Choose another
              </Button>
            </div>
          ) : (
            <FileDrop onFiles={([f]) => void pick(f)} accept="image/*" what="a picture of your signature" />
          ))}
        {mode !== "upload" && (
          <div className="flex items-center justify-between gap-2">
            <div role="group" aria-label="Ink" className="flex items-center gap-2">
              {INKS.map((ink) => (
                <button
                  key={ink.color}
                  type="button"
                  aria-pressed={color === ink.color}
                  aria-label={ink.label}
                  title={ink.label}
                  onClick={() => setColor(ink.color)}
                  className={swatchButton}
                  style={{ background: ink.color }}
                />
              ))}
            </div>
            <Button size="sm" onClick={() => (mode === "draw" ? setStrokes([]) : setName(""))} disabled={mode === "draw" ? !strokes.length : !name}>
              Clear
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-[color:var(--error)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={!ready}>
            Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

const STORAGE_KEY = "pdf-editor-signatures";
/** Saved signatures kept at most; the oldest drop off. */
const MAX_SAVED = 8;

const isSignature = (s: unknown): s is Signature => {
  const v = s as Signature;
  return !!v && typeof v.url === "string" && v.url.startsWith("data:image/png;base64,") && v.width > 0 && v.height > 0;
};

function readSaved(): Signature[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isSignature) : [];
  } catch {
    return [];
  }
}

function writeSaved(list: Signature[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked or full: the signatures still last until the page closes.
  }
}

/** The signature to place next: the person's saved ones, and a way to make a new one. */
export function SignaturePicker({ value, onChange }: { value: Signature | null; onChange: (signature: Signature | null) => void }) {
  const [saved, setSaved] = useState<Signature[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const list = readSaved();
    setSaved(list);
    // Ready to sign with the latest one; with none yet, go straight to making one.
    if (!value && list[0]) onChange(list[0]);
    if (!list.length) setCreating(true);
    // Only when the picker first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(next: Signature[]) {
    setSaved(next);
    writeSaved(next);
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={Plus} size="sm" onClick={() => setCreating(true)}>
          New signature
        </Button>
        <p className="text-sm text-[color:var(--text-muted)]">{saved.length ? "Pick a signature, then click the page where it goes." : "No signatures yet."}</p>
      </div>
      {saved.length > 0 && (
        <ul aria-label="Your signatures" className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 pt-1.5">
          {saved.map((s, i) => (
            <li key={s.url} className="relative">
              <button
                type="button"
                aria-pressed={value?.url === s.url}
                aria-label={`Signature ${i + 1}`}
                onClick={() => onChange(s)}
                className="flex h-14 w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-white p-1.5 hover:border-[color:var(--accent)] aria-pressed:border-[color:var(--accent)] aria-pressed:ring-2 aria-pressed:ring-[color:var(--accent)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL; next/image can't optimise it */}
                <img src={s.url} alt="" className="max-h-full max-w-full object-contain" />
              </button>
              <button
                type="button"
                aria-label={`Remove signature ${i + 1}`}
                title="Remove this signature"
                onClick={() => {
                  save(saved.filter((x) => x.url !== s.url));
                  if (value?.url === s.url) onChange(null);
                }}
                className="absolute -right-1.5 -top-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] p-0.5 text-[color:var(--text-muted)] hover:text-[color:var(--error)]"
              >
                <X aria-hidden className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <SignatureDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(signature) => {
          save([signature, ...saved].slice(0, MAX_SAVED));
          onChange(signature);
          setCreating(false);
        }}
      />
    </div>
  );
}

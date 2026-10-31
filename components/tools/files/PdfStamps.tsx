"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import ColorPicker from "@/components/ui/ColorPicker";
import Dialog from "@/components/ui/Dialog";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import TextInput from "@/components/ui/TextInput";
import type { Box } from "@/lib/tools/files/pdf-editor";
import { SWATCH_ROWS } from "@/lib/tools/files/pdf-colors";
import { STANDARD_STAMPS, stampLayout, stampName, stampSize, type Stamp } from "@/lib/tools/files/pdf-stamps";
import { pathD } from "@/lib/tools/files/pdf-editor";
import { unsupportedCharacters } from "@/lib/tools/files/pdf-watermark";

let measureCtx: CanvasRenderingContext2D | null = null;

/** Words' width at size 1 in the stamp font, measured with the matching screen font. */
export function stampWidthAt1(text: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 0.6;
  measureCtx.font = "italic bold 100px Helvetica, Arial, sans-serif";
  return measureCtx.measureText(text).width / 100;
}

/** A stamp drawn in its box, in the same units as the box (page points on the page). */
export function StampDrawing({ stamp }: { stamp: Stamp & Box }) {
  const look = stampLayout(stamp, stampWidthAt1);
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* Fills the whole box, so the stamp is easy to grab. */}
      <rect x={stamp.x} y={stamp.y} width={stamp.width} height={stamp.height} fill="transparent" />
      {look.frame && <path d={pathD(look.frame)} fill={look.fill} stroke={stamp.color} strokeWidth={look.frameWidth} />}
      {look.mark && <path d={pathD(look.mark)} fill="none" stroke={stamp.color} strokeWidth={look.markWidth} />}
      {look.text && (
        <text
          x={look.text.cx}
          y={look.text.baseline}
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
          fontWeight="bold"
          fontStyle="italic"
          fontSize={look.text.size}
          fill={look.text.color}
          style={{ whiteSpace: "pre" }}
        >
          {stamp.text}
        </text>
      )}
    </g>
  );
}

/** A stamp at its own size, as a small picture for the picker. */
function StampPreview({ stamp }: { stamp: Stamp }) {
  const size = stampSize(stamp, stampWidthAt1);
  return (
    <svg aria-hidden viewBox={`-1 -1 ${size.width + 2} ${size.height + 2}`} className="h-6 w-auto max-w-full overflow-visible">
      <StampDrawing stamp={{ ...stamp, x: 0, y: 0, ...size }} />
    </svg>
  );
}

const STORAGE_KEY = "pdf-editor-stamps";

const isStamp = (s: unknown): s is Stamp => {
  const v = s as Stamp;
  return !!v && typeof v.text === "string" && typeof v.color === "string" && /^#[0-9a-f]{6}$/i.test(v.color) && (v.shape === "box" || v.shape === "flag");
};

/** Stamps made with "Create new stamp", kept in this browser only. */
function readCustom(): Stamp[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isStamp) : [];
  } catch {
    return [];
  }
}

function writeCustom(stamps: Stamp[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps));
  } catch {
    // Storage blocked: the stamps still last until the page closes.
  }
}

const SHAPES = [
  { id: "box", label: "Box" },
  { id: "flag", label: "Flag" },
] as const;

const sameStamp = (a: Stamp, b: Stamp) => a.text === b.text && a.color === b.color && a.shape === b.shape;

/** The stamp to place next: the standard set and the person's own, with a way to make a new one. */
export function StampPicker({ value, onChange }: { value: Stamp; onChange: (stamp: Stamp) => void }) {
  const [custom, setCustom] = useState<Stamp[]>([]);
  const [creating, setCreating] = useState(false);
  useEffect(() => setCustom(readCustom()), []);

  function saveCustom(next: Stamp[]) {
    setCustom(next);
    writeCustom(next);
  }

  const option = (stamp: Stamp, mine: boolean) => (
    <li key={`${mine ? "mine" : "std"}-${stamp.shape}-${stamp.color}-${stamp.text}`} className="relative">
      <button
        type="button"
        aria-pressed={sameStamp(stamp, value)}
        aria-label={`${stampName(stamp)}${mine ? " (yours)" : ""}`}
        title={stampName(stamp)}
        onClick={() => onChange(stamp)}
        className="flex h-10 w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-white px-2 hover:border-[color:var(--accent)] aria-pressed:border-[color:var(--accent)] aria-pressed:ring-2 aria-pressed:ring-[color:var(--accent)]"
      >
        <StampPreview stamp={stamp} />
      </button>
      {mine && (
        <button
          type="button"
          aria-label={`Remove your stamp ${stampName(stamp)}`}
          title="Remove this stamp"
          onClick={() => saveCustom(custom.filter((s) => !sameStamp(s, stamp)))}
          className="absolute -right-1.5 -top-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] p-0.5 text-[color:var(--text-muted)] hover:text-[color:var(--error)]"
        >
          <X aria-hidden className="h-3 w-3" />
        </button>
      )}
    </li>
  );

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={Plus} size="sm" onClick={() => setCreating(true)}>
          Create new stamp
        </Button>
        <p className="text-sm text-[color:var(--text-muted)]">Pick a stamp, then click the page where it goes.</p>
      </div>
      <div className="max-h-48 space-y-3 overflow-y-auto pr-1 pt-1.5">
        {custom.length > 0 && (
          <section aria-label="Your stamps">
            <h4 className="mb-1.5 text-xs font-medium text-[color:var(--text-muted)]">Your stamps</h4>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">{custom.map((s) => option(s, true))}</ul>
          </section>
        )}
        <section aria-label="Standard stamps">
          <h4 className="mb-1.5 text-xs font-medium text-[color:var(--text-muted)]">Standard stamps</h4>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">{STANDARD_STAMPS.map((s) => option(s, false))}</ul>
        </section>
      </div>
      <CreateStampDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(stamp) => {
          saveCustom([stamp, ...custom.filter((s) => !sameStamp(s, stamp))]);
          onChange(stamp);
          setCreating(false);
        }}
      />
    </div>
  );
}

function CreateStampDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (stamp: Stamp) => void }) {
  const [text, setText] = useState("");
  const [color, setColor] = useState("#4a90e2");
  const [shape, setShape] = useState<"box" | "flag">("box");
  const textId = useId();
  const errorId = useId();
  const words = text.trim();
  const bad = unsupportedCharacters(words);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!words || bad.length) return;
    onCreate({ text: words, color, shape });
    setText("");
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create new stamp" description="It's kept in this browser, ready for other PDFs too.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Words" htmlFor={textId}>
          <TextInput
            id={textId}
            value={text}
            maxLength={40}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. RECEIVED"
            aria-invalid={bad.length > 0}
            aria-describedby={bad.length ? errorId : undefined}
            autoFocus
          />
        </Field>
        {bad.length > 0 && (
          <p id={errorId} className="text-sm text-[color:var(--error)]">
            Stamps can&apos;t use {bad.map((c) => `“${c}”`).join(" ")}.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <ColorPicker label="Color" named rows={SWATCH_ROWS} value={color} onChange={(v) => v && setColor(v)} />
          <SegmentedControl label="Shape" options={SHAPES} value={shape} onChange={setShape} />
        </div>
        <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-[color:var(--border)] bg-white px-3">
          {words ? <StampPreview stamp={{ text: words, color, shape }} /> : <span className="text-sm text-neutral-500">Preview</span>}
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!words || bad.length > 0}>
            Create stamp
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

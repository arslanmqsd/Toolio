"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, RotateCcw, TriangleAlert } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { encode } from "uqr";
import { CopyButton, InputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import FileDrop from "@/components/ui/FileDrop";
import { plural } from "@/lib/notices";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { sniffImage } from "@/lib/tools/files/images-to-pdf";
import { shrinkPhoto } from "@/lib/tools/files/prepare-image";
import {
  channelName,
  fromBase64Url,
  newSession,
  parseSession,
  partCollector,
  seal,
  sessionLink,
  toBase64Url,
  toParts,
  unseal,
  type Part,
  type ScanSession,
} from "@/lib/tools/files/scan-link";
import ImagesToPdf from "./ImagesToPdf";

const muted = "font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]";

/** Proves a message came from someone holding the key: only they can seal this so it opens. */
const HELLO = new TextEncoder().encode("toolio-scan-hello");

function openChannel(id: string): RealtimeChannel {
  // ack: each send resolves once the relay has the message, so parts go out one after another without flooding it.
  return createClient().channel(channelName(id), { config: { broadcast: { self: false, ack: true } } });
}

/** The phone opens the link with the session in it; everywhere else this is the computer side. */
export default function ScanToPdf() {
  // Read after mounting: the server can't see the fragment, and both renders must match.
  const [phone, setPhone] = useState<ScanSession | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setPhone(parseSession(window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (phone) return <PhoneScanner session={phone} />;
  return (
    <ImagesToPdf
      source={(addFiles) => <ComputerLink onFiles={addFiles} />}
      initialSize="a4"
      outName="scan.pdf"
      emptyText="Scan pages with your phone and they'll appear here, one page each."
    />
  );
}

/** A QR code drawn as one SVG path. Always dark on white: phone cameras read that most reliably, in either theme. */
function QrCode({ value }: { value: string }) {
  const { size, path } = useMemo(() => {
    const { data } = encode(value, { ecc: "M", border: 2 });
    let d = "";
    data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)));
    return { size: data.length, path: d };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code that opens the scanner on your phone" className="h-44 w-44 shrink-0 rounded-md bg-white" shapeRendering="crispEdges">
      <path d={path} fill="#000" />
    </svg>
  );
}

type Link = "connecting" | "waiting" | "connected" | "error";

function ComputerLink({ onFiles }: { onFiles: (files: File[]) => void }) {
  // Made after mounting, so each visit (and each reload) gets its own key.
  const [session, setSession] = useState<ScanSession | null>(null);
  const [link, setLink] = useState<Link>("connecting");
  const [received, setReceived] = useState(0);
  const addFiles = useRef(onFiles);
  addFiles.current = onFiles;

  useEffect(() => setSession(newSession()), []);

  useEffect(() => {
    if (!session || !hasSupabaseEnv) return;
    const channel = openChannel(session.id);
    const collector = partCollector();
    const seen = new Set<string>();
    let count = 0;
    const ready = () => void channel.send({ type: "broadcast", event: "ready", payload: {} });
    channel
      .on("broadcast", { event: "hello" }, async ({ payload }) => {
        try {
          await unseal(session.key, fromBase64Url(String(payload?.proof)));
          setLink("connected");
          ready();
        } catch {
          // Not from our phone.
        }
      })
      .on("broadcast", { event: "part" }, async ({ payload }) => {
        const part = payload as Part;
        const sealed = collector.add(part);
        if (!sealed) return;
        try {
          const bytes = await unseal(session.key, sealed);
          if (sniffImage(bytes) !== "jpg") return;
          // The relay can deliver a message twice; a page should still arrive once.
          if (!seen.has(part.photo)) {
            seen.add(part.photo);
            addFiles.current([new File([bytes as Uint8Array<ArrayBuffer>], `scan-${++count}.jpg`, { type: "image/jpeg" })]);
            setReceived(count);
            setLink("connected");
          }
          void channel.send({ type: "broadcast", event: "received", payload: { photo: part.photo } });
        } catch {
          // Wrong key or changed on the way: drop it.
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLink((l) => (l === "connected" ? l : "waiting"));
          ready();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLink("error");
      });
    return () => void createClient().removeChannel(channel);
  }, [session]);

  const url = session && typeof window !== "undefined" ? sessionLink(window.location.href, session) : "";

  return (
    <div className="space-y-4">
      {!hasSupabaseEnv ? (
        <Alert title="Phone scanning is off" tone="warn">
          Scanning from a phone needs the site&apos;s connection service, which isn&apos;t set up here. You can still add photos below.
        </Alert>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {url ? <QrCode value={url} /> : <div className="h-44 w-44 shrink-0 animate-pulse rounded-md bg-[color:var(--surface)]" aria-hidden />}
          <div className="min-w-0 space-y-2 font-[family-name:var(--font-ui)]">
            <p className="font-semibold">Scan this code with your phone&apos;s camera</p>
            <p className="text-sm text-[color:var(--text-muted)]">Open the link, photograph each page, and the pages appear here. Keep this page open while you scan.</p>
            <p role="status" className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${link === "connected" ? "bg-[color:var(--accent)]" : link === "error" ? "bg-[color:var(--error)]" : "animate-pulse bg-[color:var(--text-muted)]"}`}
              />
              {link === "connecting"
                ? "Getting the link ready…"
                : link === "waiting"
                  ? "Waiting for your phone…"
                  : link === "error"
                    ? "Couldn't connect. Check your internet connection, then reload the page."
                    : received
                      ? `Phone connected · ${plural(received, "page", "pages")} received`
                      : "Phone connected"}
            </p>
            {url && <CopyButton text={url} what="link" />}
          </div>
        </div>
      )}
      <FileDrop onFiles={onFiles} accept="image/*" multiple what="photos from this device" compact />
      <p className={`text-xs ${muted}`}>Photos are encrypted on your phone with a key that&apos;s only in this code, so nothing in between can see them.</p>
    </div>
  );
}

interface Shot {
  id: string;
  url: string;
  status: "sending" | "sent" | "failed";
  /** 0–1 while sending. */
  progress: number;
}

/** How long to wait for the computer to confirm a photo once all of it has been sent. */
const CONFIRM_MS = 15_000;

function PhoneScanner({ session }: { session: ScanSession }) {
  const [link, setLink] = useState<"connecting" | "connected" | "lost">("connecting");
  const [shots, setShots] = useState<Shot[]>([]);
  const channel = useRef<RealtimeChannel | null>(null);
  const files = useRef(new Map<string, File>());
  const confirms = useRef(new Map<string, () => void>());
  const queue = useRef(Promise.resolve());
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasSupabaseEnv) return;
    const ch = (channel.current = openChannel(session.id));
    // The computer answers hello; no answer means its page was closed or reloaded with a new code.
    const timer = window.setTimeout(() => setLink((l) => (l === "connected" ? l : "lost")), 10_000);
    ch.on("broadcast", { event: "ready" }, () => setLink("connected"))
      .on("broadcast", { event: "received" }, ({ payload }) => confirms.current.get(String(payload?.photo))?.())
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") void ch.send({ type: "broadcast", event: "hello", payload: { proof: toBase64Url(await seal(session.key, HELLO)) } });
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLink("lost");
      });
    const urls = files.current;
    return () => {
      window.clearTimeout(timer);
      channel.current = null;
      void createClient().removeChannel(ch);
      urls.clear();
    };
  }, [session]);

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps -- revoke on leave only

  const update = (id: string, patch: Partial<Shot>) => setShots((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function send(id: string) {
    const ch = channel.current;
    const file = files.current.get(id);
    if (!ch || !file) return;
    update(id, { status: "sending", progress: 0 });
    let cleanup = () => {};
    try {
      // A new id per attempt: the computer may still hold pieces of a failed one under the old id.
      const msg = toBase64Url(crypto.getRandomValues(new Uint8Array(9)));
      const parts = await toParts(session.key, msg, await shrinkPhoto(file));
      const confirmed = new Promise<boolean>((resolve) => confirms.current.set(msg, () => resolve(true)));
      cleanup = () => confirms.current.delete(msg);
      for (const [i, part] of parts.entries()) {
        // One retry: a busy relay sometimes drops a message.
        if ((await ch.send({ type: "broadcast", event: "part", payload: part })) !== "ok" && (await ch.send({ type: "broadcast", event: "part", payload: part })) !== "ok") throw new Error("send");
        update(id, { progress: (i + 1) / parts.length });
      }
      const ok = await Promise.race([confirmed, new Promise<boolean>((r) => window.setTimeout(() => r(false), CONFIRM_MS))]);
      update(id, { status: ok ? "sent" : "failed" });
      if (ok) setLink("connected");
    } catch {
      update(id, { status: "failed" });
    } finally {
      cleanup();
    }
  }

  const enqueue = (id: string) => (queue.current = queue.current.then(() => send(id)));

  function take(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      if (!file.type.startsWith("image/")) continue;
      const id = toBase64Url(crypto.getRandomValues(new Uint8Array(9)));
      files.current.set(id, file);
      setShots((s) => [...s, { id, url: URL.createObjectURL(file), status: "sending", progress: 0 }]);
      enqueue(id);
    }
  }

  const sent = shots.filter((s) => s.status === "sent").length;

  return (
    <InputPanel label="Scan with your phone" wide>
      <div className="space-y-5 font-[family-name:var(--font-ui)]">
        {!hasSupabaseEnv ? (
          <Alert title="Phone scanning is off">This site isn&apos;t set up for scanning from a phone.</Alert>
        ) : link === "lost" ? (
          <Alert title="Can't reach your computer" tone="warn">
            Make sure the Scan to PDF page is still open there. If it was reloaded, it shows a new code: scan that one instead.
          </Alert>
        ) : (
          <p role="status" className="flex items-center gap-2 text-sm">
            <span aria-hidden className={`h-2 w-2 rounded-full ${link === "connected" ? "bg-[color:var(--accent)]" : "animate-pulse bg-[color:var(--text-muted)]"}`} />
            {link === "connected" ? "Connected to your computer" : "Connecting to your computer…"}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" icon={Camera} onClick={() => camera.current?.click()} disabled={!hasSupabaseEnv}>
            Take photo
          </Button>
          <Button icon={ImagePlus} onClick={() => gallery.current?.click()} disabled={!hasSupabaseEnv}>
            Choose photos
          </Button>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              take(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={gallery}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              take(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        <p className={`text-sm ${muted}`}>
          Lay each page flat in good light and fill the frame with it. Every photo goes to your computer as a page; put them in order and make the PDF there.
        </p>

        {shots.length > 0 && (
          <>
            <p className="text-sm font-medium">
              {sent} of {plural(shots.length, "page", "pages")} sent
            </p>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {shots.map((shot, i) => (
                <li key={shot.id} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL; next/image can't optimise it */}
                  <img src={shot.url} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full rounded border border-[color:var(--border)] object-cover" />
                  <p className="flex items-center gap-1 text-xs">
                    {shot.status === "sent" ? (
                      <>
                        <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-[color:var(--accent)]" /> Sent
                      </>
                    ) : shot.status === "failed" ? (
                      <>
                        <TriangleAlert aria-hidden className="h-3.5 w-3.5 text-[color:var(--error)]" />
                        <span className="text-[color:var(--error)]">Not sent</span>
                      </>
                    ) : (
                      <span className="text-[color:var(--text-muted)]">Sending {Math.round(shot.progress * 100)}%</span>
                    )}
                  </p>
                  {shot.status === "failed" && (
                    <Button size="sm" icon={RotateCcw} onClick={() => enqueue(shot.id)}>
                      Retry
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </InputPanel>
  );
}

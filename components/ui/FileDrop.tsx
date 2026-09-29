"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";

interface FileDropProps {
  onFiles: (files: File[]) => void;
  /** Passed to the file input, e.g. "image/*" or ".csv". */
  accept?: string;
  multiple?: boolean;
  /** Short description of what to drop, e.g. "a file" or "images". */
  what?: string;
}

/** Drop zone plus file picker. Files never leave the browser. */
export default function FileDrop({ onFiles, accept, multiple = false, what = multiple ? "files" : "a file" }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function take(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      // Ignore leave events fired when the pointer moves onto a child.
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
      // The whole zone is a click target; the inner button is the keyboard route.
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target !== inputRef.current && !target.closest("button")) inputRef.current?.click();
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center text-sm ${
        dragging ? "border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-[color:var(--border)]"
      }`}
    >
      <Upload aria-hidden className="h-6 w-6 text-[color:var(--text-muted)]" />
      <p>
        Drop {what} here or{" "}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          className="text-[color:var(--accent-text)] underline">
          choose {multiple ? "files" : "one"}
        </button>
      </p>
      <p className="text-xs text-[color:var(--text-muted)]">Processed in your browser. Nothing is uploaded.</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

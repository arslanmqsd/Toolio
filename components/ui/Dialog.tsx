"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * Modal dialog on the native <dialog> element: the browser traps focus, makes the page behind inert,
 * and closes it on Escape. Clicking the backdrop closes it too.
 */
export default function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape and form[method=dialog] close natively; keep React state in sync.
      onClose={onClose}
      // The backdrop is part of the <dialog> box, so a click whose target is the dialog itself landed outside the content.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="w-[calc(100%-2rem)] max-w-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-0 text-[color:var(--text)] shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="relative p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
        <h2 id={titleId} className="pr-8 text-lg font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-1 text-sm text-[color:var(--text-muted)]">
            {description}
          </p>
        )}
        <div className="mt-5">{children}</div>
      </div>
    </dialog>
  );
}

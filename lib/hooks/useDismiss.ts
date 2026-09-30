"use client";

import { useEffect, type RefObject } from "react";

/**
 * Closes a popover (menu, dropdown) on a pointer press outside `root` or on Escape. Escape also returns
 * focus to `trigger`, so keyboard users land back where they opened it.
 */
export function useDismiss(
  open: boolean,
  close: () => void,
  root: RefObject<HTMLElement>,
  trigger?: RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      close();
      trigger?.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, root, trigger]);
}

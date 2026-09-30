"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DataType } from "@/registry/data-types";
import { detectType } from "./detectors";

/** Where the workbench value came from. */
export type WorkbenchOrigin =
  /** Pasted anywhere on the site. `intoField` pastes already landed in an input on `path`. */
  | { kind: "paste"; path: string; intoField: boolean }
  /** Handed from one tool's output to another tool via "Send to". */
  | { kind: "send"; from: string; to: string }
  /** A saved snippet loaded from the dashboard into tool `to`. */
  | { kind: "snippet"; label: string; to: string };

export type WorkbenchState =
  | { type: null; value: ""; origin: null }
  | { type: DataType; value: string; origin: WorkbenchOrigin };

interface WorkbenchContextValue {
  workbench: WorkbenchState;
  setWorkbench: (next: WorkbenchState) => void;
  clearWorkbench: () => void;
}

export const EMPTY_WORKBENCH: WorkbenchState = { type: null, value: "", origin: null };

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * Holds the last thing pasted anywhere on the site, or sent from one tool to another, tagged with
 * its type. It lives in memory only, so a full page reload clears it.
 */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [workbench, setWorkbench] = useState<WorkbenchState>(EMPTY_WORKBENCH);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      // Never keep what's pasted into password fields.
      if (event.target instanceof HTMLInputElement && event.target.type === "password") return;
      const value = event.clipboardData?.getData("text/plain") ?? "";
      if (!value.trim()) return;
      setWorkbench({
        type: detectType(value),
        value,
        origin: { kind: "paste", path: window.location.pathname, intoField: isEditable(event.target) },
      });
    }
    // Listen without preventDefault so pastes into fields still work normally.
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const context = useMemo(
    () => ({ workbench, setWorkbench, clearWorkbench: () => setWorkbench(EMPTY_WORKBENCH) }),
    [workbench],
  );
  return <WorkbenchContext.Provider value={context}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchContextValue {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error("useWorkbench must be used inside <WorkbenchProvider>.");
  return context;
}

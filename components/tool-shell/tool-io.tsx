"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useWorkbench } from "@/components/workbench/context";
import { getToolById, type ToolConfig } from "@/registry";

interface ToolInput {
  /** Replaces the tool's main input with outside data. */
  fill: (value: string) => void;
}

interface ToolIOContextValue {
  tool: ToolConfig;
  /** Whether the tool has registered a main input that outside data can fill. */
  hasInput: boolean;
  register: (input: ToolInput) => () => void;
  fill: (value: string) => void;
}

const ToolIOContext = createContext<ToolIOContextValue | null>(null);

/** Connects a tool page to the workbench: its input can be filled from outside, its output sent on. */
export function ToolIOProvider({ toolId, children }: { toolId: string; children: ReactNode }) {
  const tool = getToolById(toolId);
  if (!tool) throw new Error(`Unknown tool "${toolId}".`);

  const input = useRef<ToolInput | null>(null);
  const [hasInput, setHasInput] = useState(false);

  const register = useCallback((next: ToolInput) => {
    input.current = next;
    setHasInput(true);
    return () => {
      if (input.current === next) input.current = null;
      setHasInput(false);
    };
  }, []);

  const fill = useCallback((value: string) => input.current?.fill(value), []);

  const context = useMemo(() => ({ tool, hasInput, register, fill }), [tool, hasInput, register, fill]);
  return <ToolIOContext.Provider value={context}>{children}</ToolIOContext.Provider>;
}

/** The current tool page's I/O, or null outside a tool page. */
export function useToolIO(): ToolIOContextValue | null {
  return useContext(ToolIOContext);
}

/**
 * State for a tool's main input, like `useState(initial)`, that the workbench can fill: from a
 * "Use pasted …" banner, or straight away when another tool sent data here. `onFill` runs on
 * outside fills, e.g. to switch the tool back to the mode that shows this input.
 */
export function useToolInput(initial: string, onFill?: () => void) {
  const io = useToolIO();
  const { workbench, clearWorkbench } = useWorkbench();
  const sentHere =
    workbench.origin?.kind === "send" && io !== null && workbench.origin.to === io.tool.id ? workbench.value : null;

  const [value, setValue] = useState(() => sentHere ?? initial);

  // Data sent here has been used; clear it so going back and forth doesn't apply it again.
  const consumedSend = useRef(sentHere !== null);
  useEffect(() => {
    if (!consumedSend.current) return;
    consumedSend.current = false;
    onFill?.();
    clearWorkbench();
    // Runs once on mount, for the value read in the initializer above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFillRef = useRef(onFill);
  onFillRef.current = onFill;
  const register = io?.register;
  useEffect(
    () =>
      register?.({
        fill: (next) => {
          setValue(next);
          onFillRef.current?.();
        },
      }),
    [register],
  );

  return [value, setValue] as const;
}

"use client";

import { useEffect } from "react";
import { useSync } from "@/lib/sync";

export default function RecordToolVisit({ id }: { id: string }) {
  const { ready, recordToolUse } = useSync();
  useEffect(() => {
    if (ready) void recordToolUse(id);
  }, [ready, recordToolUse, id]);
  return null;
}

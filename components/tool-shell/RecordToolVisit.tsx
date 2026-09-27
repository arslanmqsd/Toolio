"use client";

import { useEffect } from "react";
import { recordToolVisit } from "@/lib/recent-tools/recent-tools";

export default function RecordToolVisit({ id }: { id: string }) {
  useEffect(() => {
    recordToolVisit(id);
  }, [id]);
  return null;
}

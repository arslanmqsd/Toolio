"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { requestSearchFocus, SEARCH_INPUT_ID } from "@/lib/search/search-focus";

/** Cmd+K / Ctrl+K from any page focuses the tool search. */
export default function SearchHotkey() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      const input = document.getElementById(SEARCH_INPUT_ID);
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      } else {
        requestSearchFocus();
        router.push("/");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}

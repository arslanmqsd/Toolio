"use client";

import { Star } from "lucide-react";
import Button from "@/components/ui/Button";
import { useSync, useSyncedData } from "@/lib/sync";

/** Pins the tool to the dashboard's Favorites. Works signed out too, on this device only. */
export default function FavoriteButton({ toolId }: { toolId: string }) {
  const { toggleFavorite } = useSync();
  const [favorites, setFavorites] = useSyncedData("favorites");
  const pinned = favorites?.includes(toolId) ?? false;

  async function toggle() {
    const before = favorites ?? [];
    setFavorites(pinned ? before.filter((id) => id !== toolId) : [toolId, ...before]);
    try {
      await toggleFavorite(toolId);
    } catch {
      setFavorites(before);
    }
  }

  // A fixed label with aria-pressed: screen readers announce "Favorite, toggle button, pressed".
  return (
    <Button
      onClick={toggle}
      disabled={favorites === null}
      aria-pressed={pinned}
      title={pinned ? "Remove from your dashboard's favorites" : "Pin to your dashboard's favorites"}
      className="shrink-0 aria-pressed:border-[color:var(--accent)]"
    >
      <Star aria-hidden className={`h-4 w-4 ${pinned ? "fill-[color:var(--accent-text)] text-[color:var(--accent-text)]" : ""}`} />
      Favorite
    </Button>
  );
}

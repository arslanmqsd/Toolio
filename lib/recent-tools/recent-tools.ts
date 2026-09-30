export const RECENT_TOOLS_KEY = "recent-tools";
export const MAX_RECENT_TOOLS = 8;

/** Pure: puts `id` first, removes its older duplicate, caps the list. */
export function addRecent(ids: string[], id: string, max = MAX_RECENT_TOOLS): string[] {
  return [id, ...ids.filter((existing) => existing !== id)].slice(0, max);
}

/** Tool ids, most recent first. Empty when storage is unavailable or corrupt. */
export function readRecentTools(key = RECENT_TOOLS_KEY): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeRecentTools(ids: string[], key = RECENT_TOOLS_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids.slice(0, MAX_RECENT_TOOLS)));
  } catch {
    // Storage unavailable (private mode etc.): recents are a convenience, skip.
  }
}

export function recordToolVisit(id: string, key = RECENT_TOOLS_KEY): void {
  writeRecentTools(addRecent(readRecentTools(key), id), key);
}

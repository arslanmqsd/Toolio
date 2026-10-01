import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";
import {
  addRecent,
  MAX_RECENT_TOOLS,
  readRecentTools,
  recordToolVisit,
  RECENT_TOOLS_KEY,
  writeRecentTools,
} from "@/lib/recent-tools/recent-tools";

/**
 * Favorites, recent tools and saved snippets, wherever they live.
 *
 * Signed out: localStorage only, under the same keys the app has always used.
 * Signed in: Supabase is the source of truth, mirrored to per-user localStorage keys
 * (`sync:<userId>:…`) so lists render instantly before the network answers. The signed-out
 * data is never touched while signed in; on the first sign-in on a device it's copied up once.
 */

export interface Snippet {
  id: string;
  toolId: string;
  label: string;
  value: string;
  createdAt: string;
}

/** One tool's last use. `usedAt` is null for signed-out history, which keeps only the order. */
export interface HistoryEntry {
  toolId: string;
  usedAt: string | null;
}

export interface Sync {
  signedIn: boolean;
  getFavorites(): Promise<string[]>;
  /** Stars or unstars a tool. Resolves to whether it is now a favorite. */
  toggleFavorite(toolId: string): Promise<boolean>;
  getRecentTools(): Promise<string[]>;
  recordToolUse(toolId: string): Promise<void>;
  /** Tools by last use, newest first, with when; up to `limit`. */
  getHistory(limit?: number): Promise<HistoryEntry[]>;
  /** One tool's snippets, or every snippet when `toolId` is omitted; newest first. */
  getSnippets(toolId?: string): Promise<Snippet[]>;
  saveSnippet(toolId: string, label: string, value: string): Promise<Snippet>;
  deleteSnippet(id: string): Promise<void>;
  /** Synchronous reads of the local copy, for a first render before the get* calls resolve. */
  peekFavorites(): string[];
  peekRecentTools(): string[];
  peekHistory(limit?: number): HistoryEntry[];
  peekSnippets(toolId?: string): Snippet[];
}

export const FAVORITES_KEY = "favorite-tools";
export const SNIPPETS_KEY = "snippets";
/** The account's history keeps more than the 8 recents the home page shows. */
export const MAX_HISTORY = 20;
const HISTORY_MIRROR = "history";
/** Mirror keys start with this; everything under it is cleared once nobody is signed in. */
const MIRROR_PREFIX = "sync:";
/** Set once a device's signed-out data has been copied to that account. Outlives sign-out on purpose. */
const importedKey = (userId: string) => `sync-imported:${userId}`;

/** Same limits as the snippets table's check constraints, so both modes reject the same input. */
export const MAX_SNIPPET_LABEL = 200;
export const MAX_SNIPPET_BYTES = 100 * 1024;

function storageKeys(userId: string | null) {
  const prefix = userId ? `${MIRROR_PREFIX}${userId}:` : "";
  return {
    favorites: prefix + FAVORITES_KEY,
    recents: prefix + RECENT_TOOLS_KEY,
    snippets: prefix + SNIPPETS_KEY,
  };
}

// localStorage can throw (private mode, blocked site data) or hold anything; every read validates.

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the local copy is a convenience, skip.
  }
}

function readIds(key: string): string[] {
  const parsed = readJson(key);
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
}

const forTool = (snippets: Snippet[], toolId?: string) =>
  toolId === undefined ? snippets : snippets.filter((s) => s.toolId === toolId);

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const h = value as Record<string, unknown>;
  return typeof h.toolId === "string" && (typeof h.usedAt === "string" || h.usedAt === null);
}

function readHistory(key: string): HistoryEntry[] {
  const parsed = readJson(key);
  return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
}

function isSnippet(value: unknown): value is Snippet {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return [s.id, s.toolId, s.label, s.value, s.createdAt].every((field) => typeof field === "string");
}

function readSnippets(key: string): Snippet[] {
  const parsed = readJson(key);
  return Array.isArray(parsed) ? parsed.filter(isSnippet) : [];
}

/** Trims the label and checks both fields; throws with a message fit to show the user. */
export function validateSnippet(label: string, value: string): string {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Give the snippet a name.");
  if (trimmed.length > MAX_SNIPPET_LABEL) throw new Error(`Keep the name under ${MAX_SNIPPET_LABEL} characters.`);
  if (new TextEncoder().encode(value).length > MAX_SNIPPET_BYTES) {
    throw new Error("That's too large to save as a snippet (100 KB max).");
  }
  return trimmed;
}

/** Removes every signed-in mirror, so a shared device doesn't keep an account's data after sign-out. */
export function clearSyncMirrors(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) if (key?.startsWith(MIRROR_PREFIX)) localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing was mirrored.
  }
}

/** Signed-out history is the recents list, which has no times. */
function localHistory(key: string, limit: number): HistoryEntry[] {
  return readRecentTools(key)
    .slice(0, limit)
    .map((toolId) => ({ toolId, usedAt: null }));
}

function localSync(): Sync {
  const keys = storageKeys(null);
  return {
    signedIn: false,
    peekFavorites: () => readIds(keys.favorites),
    peekRecentTools: () => readRecentTools(keys.recents),
    peekHistory: (limit = MAX_HISTORY) => localHistory(keys.recents, limit),
    peekSnippets: (toolId) => forTool(readSnippets(keys.snippets), toolId),
    getFavorites: async () => readIds(keys.favorites),
    async toggleFavorite(toolId) {
      const current = readIds(keys.favorites);
      const on = !current.includes(toolId);
      writeJson(keys.favorites, on ? [toolId, ...current] : current.filter((id) => id !== toolId));
      return on;
    },
    getRecentTools: async () => readRecentTools(keys.recents),
    recordToolUse: async (toolId) => recordToolVisit(toolId, keys.recents),
    getHistory: async (limit = MAX_HISTORY) => localHistory(keys.recents, limit),
    getSnippets: async (toolId) => forTool(readSnippets(keys.snippets), toolId),
    async saveSnippet(toolId, label, value) {
      const snippet: Snippet = {
        id: crypto.randomUUID(),
        toolId,
        label: validateSnippet(label, value),
        value,
        createdAt: new Date().toISOString(),
      };
      writeJson(keys.snippets, [snippet, ...readSnippets(keys.snippets)]);
      return snippet;
    },
    async deleteSnippet(id) {
      writeJson(keys.snippets, readSnippets(keys.snippets).filter((s) => s.id !== id));
    },
  };
}

interface SnippetRow {
  id: string;
  tool_id: string;
  label: string;
  value: string;
  created_at: string;
}

const SNIPPET_COLUMNS = "id, tool_id, label, value, created_at";

function fromRow(row: SnippetRow): Snippet {
  return { id: row.id, toolId: row.tool_id, label: row.label, value: row.value, createdAt: row.created_at };
}

/** Runs `task` while holding a cross-tab lock where the browser supports it, so two tabs don't import twice. */
async function withLock(name: string, task: () => Promise<void>): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request(name, task);
  } else {
    await task();
  }
}

function isImported(userId: string): boolean {
  try {
    return localStorage.getItem(importedKey(userId)) !== null;
  } catch {
    // Can't remember having imported, so don't import at all rather than duplicate snippets every visit.
    return true;
  }
}

/**
 * One-time copy of this device's signed-out favorites, recents and snippets into the account.
 * The signed-out copy stays as it was, for whenever nobody is signed in again.
 */
async function importLocalData(supabase: SupabaseClient, userId: string): Promise<void> {
  if (isImported(userId)) return;
  await withLock(`toolio:${importedKey(userId)}`, async () => {
    if (isImported(userId)) return; // Another tab finished it while this one waited.
    const local = storageKeys(null);
    const favorites = readIds(local.favorites);
    const recents = readRecentTools(local.recents);
    const snippets = readSnippets(local.snippets);

    // Favorites and history are keyed by (user_id, tool_id), so a retry after a partial failure is harmless.
    if (favorites.length > 0) {
      const { error } = await supabase
        .from("favorites")
        .upsert(favorites.map((tool_id) => ({ user_id: userId, tool_id })), { ignoreDuplicates: true });
      if (error) throw error;
    }
    if (recents.length > 0) {
      // Keep the local order: a second apart, newest first.
      const now = Date.now();
      const { error } = await supabase.from("history").upsert(
        recents.map((tool_id, i) => ({ user_id: userId, tool_id, used_at: new Date(now - i * 1000).toISOString() })),
        { onConflict: "user_id,tool_id" },
      );
      if (error) throw error;
    }
    // Snippets have no natural key, so they go last, in one insert, right before the flag is set.
    if (snippets.length > 0) {
      const { error } = await supabase.from("snippets").insert(
        snippets.map((s) => ({ user_id: userId, tool_id: s.toolId, label: s.label, value: s.value, created_at: s.createdAt })),
      );
      if (error) throw error;
    }
    writeJson(importedKey(userId), new Date().toISOString());
  });
}

/** One import per account per page load; a failed one is retried on the next call. */
const imports = new Map<string, Promise<void>>();

function ensureImported(supabase: SupabaseClient, userId: string): Promise<void> {
  let pending = imports.get(userId);
  if (!pending) {
    pending = importLocalData(supabase, userId).catch((error: unknown) => {
      imports.delete(userId);
      console.warn("Couldn't copy this device's favorites and history to your account yet.", error);
    });
    imports.set(userId, pending);
  }
  return pending;
}

function remoteSync(supabase: SupabaseClient, userId: string): Sync {
  const keys = storageKeys(userId);
  const historyKey = `${MIRROR_PREFIX}${userId}:${HISTORY_MIRROR}`;
  const ready = () => ensureImported(supabase, userId);

  // Reads fall back to the mirror when the request fails (offline, say), so lists never go blank.
  return {
    signedIn: true,
    peekFavorites: () => readIds(keys.favorites),
    peekRecentTools: () => readRecentTools(keys.recents),
    peekHistory: (limit = MAX_HISTORY) => readHistory(historyKey).slice(0, limit),
    peekSnippets: (toolId) => forTool(readSnippets(keys.snippets), toolId),

    async getFavorites() {
      await ready();
      const { data, error } = await supabase
        .from("favorites")
        .select("tool_id")
        .order("created_at", { ascending: false });
      if (error) return readIds(keys.favorites);
      const ids = data.map((row: { tool_id: string }) => row.tool_id);
      writeJson(keys.favorites, ids);
      return ids;
    },

    async toggleFavorite(toolId) {
      await ready();
      const before = readIds(keys.favorites);
      const on = !before.includes(toolId);
      writeJson(keys.favorites, on ? [toolId, ...before] : before.filter((id) => id !== toolId));
      const { error } = on
        ? await supabase.from("favorites").upsert({ user_id: userId, tool_id: toolId }, { ignoreDuplicates: true })
        : await supabase.from("favorites").delete().eq("user_id", userId).eq("tool_id", toolId);
      if (error) {
        writeJson(keys.favorites, before);
        throw error;
      }
      return on;
    },

    async getRecentTools() {
      await ready();
      const { data, error } = await supabase
        .from("history")
        .select("tool_id")
        .order("used_at", { ascending: false })
        .limit(MAX_RECENT_TOOLS);
      if (error) return readRecentTools(keys.recents);
      const ids = data.map((row: { tool_id: string }) => row.tool_id);
      writeRecentTools(ids, keys.recents);
      return ids;
    },

    async getHistory(limit = MAX_HISTORY) {
      await ready();
      const { data, error } = await supabase
        .from("history")
        .select("tool_id, used_at")
        .order("used_at", { ascending: false })
        .limit(limit);
      if (error) return readHistory(historyKey).slice(0, limit);
      const entries = data.map((row: { tool_id: string; used_at: string }) => ({ toolId: row.tool_id, usedAt: row.used_at }));
      writeJson(historyKey, entries);
      return entries;
    },

    async recordToolUse(toolId) {
      writeRecentTools(addRecent(readRecentTools(keys.recents), toolId), keys.recents);
      const usedAt = new Date().toISOString();
      writeJson(historyKey, [{ toolId, usedAt }, ...readHistory(historyKey).filter((h) => h.toolId !== toolId)].slice(0, MAX_HISTORY));
      await ready();
      const { error } = await supabase
        .from("history")
        .upsert({ user_id: userId, tool_id: toolId, used_at: usedAt }, { onConflict: "user_id,tool_id" });
      // History is a convenience: a missed visit isn't worth interrupting anyone over.
      if (error) console.warn("Couldn't save this visit to your history.", error);
    },

    async getSnippets(toolId) {
      await ready();
      let query = supabase.from("snippets").select(SNIPPET_COLUMNS);
      if (toolId !== undefined) query = query.eq("tool_id", toolId);
      const { data, error } = await query.order("created_at", { ascending: false });
      const mirrored = readSnippets(keys.snippets);
      if (error) return forTool(mirrored, toolId);
      const snippets = (data as SnippetRow[]).map(fromRow);
      // Replace just what was fetched: one tool's snippets, or all of them.
      const others = toolId === undefined ? [] : mirrored.filter((s) => s.toolId !== toolId);
      writeJson(keys.snippets, [...snippets, ...others]);
      return snippets;
    },

    async saveSnippet(toolId, label, value) {
      const trimmed = validateSnippet(label, value);
      await ready();
      const { data, error } = await supabase
        .from("snippets")
        .insert({ user_id: userId, tool_id: toolId, label: trimmed, value })
        .select(SNIPPET_COLUMNS)
        .single();
      if (error) throw error;
      const snippet = fromRow(data as SnippetRow);
      writeJson(keys.snippets, [snippet, ...readSnippets(keys.snippets)]);
      return snippet;
    },

    async deleteSnippet(id) {
      await ready();
      const { error } = await supabase.from("snippets").delete().eq("id", id);
      if (error) throw error;
      writeJson(keys.snippets, readSnippets(keys.snippets).filter((s) => s.id !== id));
    },
  };
}

/** The sync layer for the given session: local-only without a signed-in user, Supabase-backed with one. */
export function createSync(supabase: SupabaseClient | null, userId: string | null): Sync {
  return supabase && userId ? remoteSync(supabase, userId) : localSync();
}

/**
 * The sync layer for whoever is signed in right now (from the auth context). `ready` is false while
 * the session is still being checked; wait for it before reading or writing, or a signed-in visit
 * could land in the signed-out lists.
 */
export function useSync(): Sync & { ready: boolean } {
  const { supabase, user, loading } = useAuth();
  const userId = user?.id ?? null;
  const sync = useMemo(() => createSync(supabase, userId), [supabase, userId]);

  useEffect(() => {
    if (!loading && !userId) clearSyncMirrors();
  }, [loading, userId]);

  return useMemo(() => ({ ...sync, ready: !loading }), [sync, loading]);
}

interface SyncedData {
  favorites: string[];
  recents: string[];
  history: HistoryEntry[];
  snippets: Snippet[];
}

function peekData<K extends keyof SyncedData>(sync: Sync, kind: K): SyncedData[K];
function peekData(sync: Sync, kind: keyof SyncedData) {
  if (kind === "favorites") return sync.peekFavorites();
  if (kind === "recents") return sync.peekRecentTools();
  if (kind === "history") return sync.peekHistory();
  return sync.peekSnippets();
}

function getData<K extends keyof SyncedData>(sync: Sync, kind: K): Promise<SyncedData[K]>;
function getData(sync: Sync, kind: keyof SyncedData) {
  if (kind === "favorites") return sync.getFavorites();
  if (kind === "recents") return sync.getRecentTools();
  if (kind === "history") return sync.getHistory();
  return sync.getSnippets();
}

/**
 * One synced list for a component: the local copy at once, then the fetched one. `data` is null until
 * the session check finishes. `setData` is for optimistic updates after a write.
 */
export function useSyncedData<K extends keyof SyncedData>(
  kind: K,
): [SyncedData[K] | null, Dispatch<SetStateAction<SyncedData[K] | null>>] {
  const sync = useSync();
  const [data, setData] = useState<SyncedData[K] | null>(null);

  useEffect(() => {
    if (!sync.ready) return;
    let current = true;
    setData(peekData(sync, kind));
    void getData(sync, kind).then((fetched) => current && setData(fetched));
    return () => {
      current = false;
    };
  }, [sync, kind]);

  return [data, setData];
}

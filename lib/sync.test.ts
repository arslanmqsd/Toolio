import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearSyncMirrors, createSync, validateSnippet } from "./sync";

// The auth context is JSX (which this config doesn't transform) and only feeds useSync, not tested here.
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({}) }));

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (i) => Array.from(items.keys())[i] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
}

interface Call {
  table: string;
  ops: [string, unknown[]][];
}

/** Records every query; each resolves to `respond(call)`. */
function fakeSupabase(respond: (call: Call) => { data?: unknown; error?: unknown } = () => ({})) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          const { data = null, error = null } = respond(call);
          return Promise.resolve({ data, error }).then(resolve, reject);
        },
      };
      for (const op of ["select", "insert", "upsert", "delete", "eq", "order", "limit", "single"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const op = (call: Call, name: string) => call.ops.find(([n]) => n === name)?.[1];

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("signed out", () => {
  it("keeps recents under the existing recent-tools key", async () => {
    const sync = createSync(null, null);
    await sync.recordToolUse("a");
    await sync.recordToolUse("b");
    expect(JSON.parse(localStorage.getItem("recent-tools")!)).toEqual(["b", "a"]);
    expect(await sync.getRecentTools()).toEqual(["b", "a"]);
  });

  it("toggles favorites on and off", async () => {
    const sync = createSync(null, null);
    expect(await sync.toggleFavorite("a")).toBe(true);
    expect(await sync.toggleFavorite("b")).toBe(true);
    expect(await sync.getFavorites()).toEqual(["b", "a"]);
    expect(await sync.toggleFavorite("a")).toBe(false);
    expect(sync.peekFavorites()).toEqual(["b"]);
  });

  it("gives history in recents order, without times", async () => {
    const sync = createSync(null, null);
    await sync.recordToolUse("a");
    await sync.recordToolUse("b");
    expect(await sync.getHistory()).toEqual([
      { toolId: "b", usedAt: null },
      { toolId: "a", usedAt: null },
    ]);
  });

  it("saves, lists per tool and deletes snippets", async () => {
    const sync = createSync(null, null);
    const saved = await sync.saveSnippet("json", "  Sample  ", "{}");
    await sync.saveSnippet("base64", "Other", "aGk=");
    expect(saved.label).toBe("Sample");
    expect(await sync.getSnippets("json")).toEqual([saved]);
    await sync.deleteSnippet(saved.id);
    expect(await sync.getSnippets("json")).toEqual([]);
  });
});

describe("validateSnippet", () => {
  it("rejects an empty label and an oversized value", () => {
    expect(() => validateSnippet("   ", "x")).toThrow("name");
    expect(() => validateSnippet("big", "x".repeat(100 * 1024 + 1))).toThrow("100 KB");
  });
});

describe("signed in", () => {
  it("copies signed-out data to the account once, and leaves the signed-out copy alone", async () => {
    localStorage.setItem("favorite-tools", JSON.stringify(["fav"]));
    localStorage.setItem("recent-tools", JSON.stringify(["r1", "r2"]));
    const { client, calls } = fakeSupabase(() => ({ data: [] }));

    await createSync(client, "user-1").getFavorites();
    const tables = calls.map((c) => c.table);
    expect(tables).toEqual(["favorites", "history", "favorites"]);
    expect(op(calls[0], "upsert")?.[0]).toEqual([{ user_id: "user-1", tool_id: "fav" }]);
    const history = op(calls[1], "upsert")?.[0] as { tool_id: string; used_at: string }[];
    expect(history.map((row) => row.tool_id)).toEqual(["r1", "r2"]);
    expect(history[0].used_at > history[1].used_at).toBe(true);
    expect(localStorage.getItem("recent-tools")).toBe(JSON.stringify(["r1", "r2"]));

    calls.length = 0;
    await createSync(client, "user-1").getFavorites();
    expect(calls.map((c) => c.table)).toEqual(["favorites"]);
  });

  it("retries the import on a later call when it fails", async () => {
    localStorage.setItem("favorite-tools", JSON.stringify(["fav"]));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let fail = true;
    const { client, calls } = fakeSupabase((call) =>
      fail && op(call, "upsert") ? { error: { message: "offline" } } : { data: [] },
    );
    await createSync(client, "user-2").getFavorites();
    expect(localStorage.getItem("sync-imported:user-2")).toBeNull();

    fail = false;
    calls.length = 0;
    await createSync(client, "user-2").getFavorites();
    expect(op(calls[0], "upsert")).toBeDefined();
    expect(localStorage.getItem("sync-imported:user-2")).not.toBeNull();
  });

  it("mirrors the account's lists to per-user keys", async () => {
    localStorage.setItem("sync-imported:user-3", "done");
    const { client } = fakeSupabase(() => ({ data: [{ tool_id: "x" }, { tool_id: "y" }] }));
    const sync = createSync(client, "user-3");
    expect(await sync.getRecentTools()).toEqual(["x", "y"]);
    expect(sync.peekRecentTools()).toEqual(["x", "y"]);
    expect(localStorage.getItem("recent-tools")).toBeNull();
  });

  it("reads history with times, and every snippet when no tool is given", async () => {
    localStorage.setItem("sync-imported:user-7", "done");
    const { client, calls } = fakeSupabase((call) =>
      call.table === "history"
        ? { data: [{ tool_id: "a", used_at: "2026-10-01T10:00:00Z" }] }
        : { data: [{ id: "1", tool_id: "a", label: "L", value: "v", created_at: "2026-10-01T09:00:00Z" }] },
    );
    const sync = createSync(client, "user-7");
    expect(await sync.getHistory()).toEqual([{ toolId: "a", usedAt: "2026-10-01T10:00:00Z" }]);
    expect(op(calls[0], "limit")).toEqual([20]);
    expect(await sync.getSnippets()).toEqual([{ id: "1", toolId: "a", label: "L", value: "v", createdAt: "2026-10-01T09:00:00Z" }]);
    expect(op(calls[1], "eq")).toBeUndefined();
    expect(sync.peekSnippets("a")).toHaveLength(1);
  });

  it("falls back to the mirror when a read fails", async () => {
    localStorage.setItem("sync-imported:user-4", "done");
    localStorage.setItem("sync:user-4:favorite-tools", JSON.stringify(["cached"]));
    const { client } = fakeSupabase(() => ({ error: { message: "offline" } }));
    expect(await createSync(client, "user-4").getFavorites()).toEqual(["cached"]);
  });

  it("undoes a favorite toggle the server rejected", async () => {
    localStorage.setItem("sync-imported:user-5", "done");
    const { client } = fakeSupabase(() => ({ error: { message: "offline" } }));
    const sync = createSync(client, "user-5");
    await expect(sync.toggleFavorite("a")).rejects.toMatchObject({ message: "offline" });
    expect(sync.peekFavorites()).toEqual([]);
  });

  it("clears mirrors but keeps the import flag and signed-out data", () => {
    localStorage.setItem("sync:user-6:recent-tools", "[]");
    localStorage.setItem("sync-imported:user-6", "done");
    localStorage.setItem("recent-tools", "[]");
    clearSyncMirrors();
    expect(localStorage.getItem("sync:user-6:recent-tools")).toBeNull();
    expect(localStorage.getItem("sync-imported:user-6")).toBe("done");
    expect(localStorage.getItem("recent-tools")).toBe("[]");
  });
});

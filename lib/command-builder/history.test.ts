// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_HISTORY, addHistory, readHistory, storableValues, writeHistory, type HistoryEntry } from "./history";
import type { Task } from "./types";

const task: Task = {
  id: "run",
  category: "c",
  title: "Run",
  summary: "",
  synonyms: [],
  fields: [
    { id: "image", label: "Image", kind: "text", default: "" },
    { id: "env", label: "Env", kind: "lines", default: "", sensitive: true },
    { id: "detach", label: "Detach", kind: "checkbox", default: true },
  ],
  build: () => [],
};
const getTask = (id: string) => (id === "run" ? task : undefined);
const entry = (image: string, at = 1): HistoryEntry => ({ taskId: "run", values: { image }, at });

describe("storableValues", () => {
  it("drops sensitive fields and values still at their default", () => {
    expect(storableValues(task, { image: "nginx:1", env: "DB_PASSWORD=hunter2", detach: true })).toEqual({ image: "nginx:1" });
    expect(storableValues(task, { image: "", env: "", detach: false })).toEqual({ detach: false });
  });
});

describe("addHistory", () => {
  it("puts the newest first, drops the same command again, and caps the list", () => {
    expect(addHistory([entry("a"), entry("b")], entry("b", 5))).toEqual([entry("b", 5), entry("a")]);
    const many = Array.from({ length: MAX_HISTORY }, (_, i) => entry(String(i)));
    expect(addHistory(many, entry("new"))).toHaveLength(MAX_HISTORY);
  });
});

describe("reading and writing", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips, and clears by removing the key", () => {
    writeHistory("k", [entry("nginx:1")]);
    expect(readHistory("k", getTask)).toEqual([entry("nginx:1")]);
    writeHistory("k", []);
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("drops sensitive values even if they were stored, and unknown tasks and junk", () => {
    localStorage.setItem(
      "k",
      JSON.stringify([{ taskId: "run", values: { image: "x:1", env: "TOKEN=secret" }, at: 1 }, { taskId: "gone", values: {}, at: 2 }, "junk", { taskId: "run" }]),
    );
    expect(readHistory("k", getTask)).toEqual([entry("x:1")]);
  });

  it("is empty when storage holds something unreadable", () => {
    localStorage.setItem("k", "{not json");
    expect(readHistory("k", getTask)).toEqual([]);
  });
});

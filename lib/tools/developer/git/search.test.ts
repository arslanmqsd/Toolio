import { describe, expect, it } from "vitest";
import { searchTasks } from "./search";

const topIds = (query: string, n = 3) => searchTasks(query, n).map((m) => m.item.id);

describe("searchTasks", () => {
  it("ranks the soft reset first for undoing the last commit", () => {
    expect(topIds("undo last commit", 1)).toEqual(["reset-soft"]);
  });

  it.each([
    ["uncommit", "reset-soft"],
    ["delete branch", "delete-branch"],
    ["discard changes", "discard-file-changes"],
    ["force push", "force-push"],
    ["stash my changes", "stash-changes"],
    ["rename branch", "rename-branch"],
    ["who wrote this line", "blame"],
    ["undo pushed commit", "revert-commit"],
  ])("finds %j → %s in the top 3", (query, id) => {
    expect(topIds(query)).toContain(id);
  });

  it("returns nothing for a blank query", () => {
    expect(searchTasks("   ")).toEqual([]);
  });
});

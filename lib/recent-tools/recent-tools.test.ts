import { describe, expect, it } from "vitest";
import { addRecent } from "./recent-tools";

describe("addRecent", () => {
  it("puts the newest visit first", () => {
    expect(addRecent(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("moves a revisited tool to the front instead of duplicating it", () => {
    expect(addRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("caps the list at 8 by default", () => {
    const ids = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(addRecent(ids, "new")).toEqual(["new", "1", "2", "3", "4", "5", "6", "7"]);
  });
});

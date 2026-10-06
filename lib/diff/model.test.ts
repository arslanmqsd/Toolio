import { describe, expect, it } from "vitest";
import { statsOf } from "./model";

describe("statsOf", () => {
  it("counts added, removed and unchanged rows, and leaves ignored rows out", () => {
    expect(
      statsOf([
        { kind: "context", oldNo: 1, newNo: 1, text: "a" },
        { kind: "add", newNo: 2, text: "b" },
        { kind: "remove", oldNo: 2, text: "c" },
        { kind: "ignored", oldNo: 3, text: "" },
      ]),
    ).toEqual({ added: 1, removed: 1, unchanged: 1 });
  });
});

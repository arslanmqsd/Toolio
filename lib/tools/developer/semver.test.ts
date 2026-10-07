import { satisfies } from "semver";
import { describe, expect, it } from "vitest";
import { analyzeRange, bumpVersion, checkVersions, compareVersions, parseVersion, parseVersionList } from "./semver";

describe("parseVersion", () => {
  it("accepts plain versions as they are", () => {
    expect(parseVersion("1.2.3")).toEqual({ input: "1.2.3", ok: true, version: "1.2.3" });
    expect(parseVersion("1.2.3-beta.1")).toMatchObject({ ok: true, version: "1.2.3-beta.1" });
  });

  it("reads loose forms and says how", () => {
    expect(parseVersion("v1.2.3")).toEqual({ input: "v1.2.3", ok: true, version: "1.2.3" });
    expect(parseVersion("=1.2.3")).toMatchObject({ ok: true, version: "1.2.3" });
    expect(parseVersion("1.2")).toMatchObject({ ok: true, version: "1.2.0", note: "Read as 1.2.0" });
    expect(parseVersion("v1")).toMatchObject({ ok: true, version: "1.0.0", note: "Read as 1.0.0" });
    expect(parseVersion("01.2.3")).toMatchObject({ ok: true, version: "1.2.3", note: "Read as 1.2.3" });
  });

  it("notes build metadata, which doesn't count in comparisons", () => {
    expect(parseVersion("1.2.3+build.7")).toMatchObject({ ok: true, version: "1.2.3", note: expect.stringMatching(/build metadata/i) });
  });

  it("rejects what isn't a version, without digging numbers out of it", () => {
    expect(parseVersion("foo1.2.3")).toMatchObject({ ok: false });
    expect(parseVersion("1.2.3.4")).toMatchObject({ ok: false });
    expect(parseVersion("latest")).toMatchObject({ ok: false });
  });

  it("splits a list on lines, commas and spaces", () => {
    expect(parseVersionList("1.0.0, 1.1.0\n  2.0.0 \n\n3.0.0;4.0.0").map((v) => v.input)).toEqual(["1.0.0", "1.1.0", "2.0.0", "3.0.0", "4.0.0"]);
  });
});

describe("analyzeRange", () => {
  it("explains a caret range", () => {
    const result = analyzeRange("^1.2.3");
    expect(result).toMatchObject({ ok: true, normalized: ">=1.2.3 <2.0.0-0", satisfiable: true, warnings: [] });
    if (!result.ok) return;
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0]).toMatchObject({ source: "^1.2.3", kind: "caret", words: "at least 1.2.3 and below 2.0.0" });
    expect(result.alternatives[0].meaning).toMatch(/minor and patch/);
  });

  it("explains caret on 0.x and 0.0.x by what it really allows", () => {
    const zeroMinor = analyzeRange("^0.2.3");
    const zeroPatch = analyzeRange("^0.0.3");
    if (!zeroMinor.ok || !zeroPatch.ok) throw new Error("expected valid");
    expect(zeroMinor.alternatives[0].meaning).toMatch(/patch updates only/);
    expect(zeroPatch.alternatives[0].meaning).toMatch(/only this version/i);
  });

  it("names tilde, hyphen, wildcard, comparison and exact ranges", () => {
    const kinds = ["~1.2.3", "1.2.3 - 2.3", "1.x", ">=1.2.7 <1.3.0", "1.2.3", "*"].map((r) => {
      const result = analyzeRange(r);
      return result.ok ? result.alternatives[0].kind : "invalid";
    });
    expect(kinds).toEqual(["tilde", "hyphen", "wildcard", "comparison", "exact", "any"]);
  });

  it("splits alternatives on ||", () => {
    const result = analyzeRange("^1.2.3 || >=2.1.0-beta <3");
    if (!result.ok) throw new Error("expected valid");
    expect(result.alternatives.map((a) => a.source)).toEqual(["^1.2.3", ">=2.1.0-beta <3"]);
    expect(result.alternatives[1].words).toBe("at least 2.1.0-beta and below 3.0.0");
  });

  it("warns about an empty alternative, which matches everything", () => {
    const result = analyzeRange("^1.2.3 ||");
    expect(result).toMatchObject({ ok: true, warnings: [expect.stringMatching(/empty/i)] });
  });

  it("warns when no version can fit", () => {
    expect(analyzeRange("1.2.3 1.2.4")).toMatchObject({ ok: true, satisfiable: false });
    expect(analyzeRange(">2.0.0 <1.0.0")).toMatchObject({ ok: true, satisfiable: false });
  });

  it("rejects invalid ranges and explains dist-tags", () => {
    expect(analyzeRange("^^1")).toMatchObject({ ok: false });
    expect(analyzeRange("latest")).toMatchObject({ ok: false, error: expect.stringMatching(/tag/) });
    expect(analyzeRange("x".repeat(2000))).toMatchObject({ ok: false });
  });
});

describe("checkVersions", () => {
  const list = parseVersionList("1.2.2 1.2.3 1.10.0 1.9.0 2.0.0 1.3.0-beta.1 nope 2.0.0-rc.1");

  it("marks each version and sorts newest first, invalid last", () => {
    const result = checkVersions("^1.2.3", list);
    expect(result.checks.map((c) => [c.version.input, c.matches])).toEqual([
      ["2.0.0", false],
      ["2.0.0-rc.1", false],
      ["1.10.0", true],
      ["1.9.0", true],
      ["1.3.0-beta.1", false],
      ["1.2.3", true],
      ["1.2.2", false],
      ["nope", false],
    ]);
    expect(result.highest).toBe("1.10.0");
    expect(result.matching).toBe(3);
  });

  it("says why a version misses", () => {
    const reasons = Object.fromEntries(checkVersions("^1.2.3", list).checks.map((c) => [c.version.input, c.reason]));
    expect(reasons["1.2.2"]).toMatch(/at least 1\.2\.3/);
    expect(reasons["2.0.0"]).toMatch(/below 2\.0\.0/);
    expect(reasons["1.3.0-beta.1"]).toMatch(/prerelease/i);
    expect(reasons["nope"]).toBeTruthy();
  });

  it("counts prereleases when asked", () => {
    const result = checkVersions("^1.2.3", list, { includePrerelease: true });
    expect(result.checks.find((c) => c.version.input === "1.3.0-beta.1")?.matches).toBe(true);
    expect(result.checks.find((c) => c.version.input === "2.0.0-rc.1")?.matches).toBe(false);
  });

  it("handles * and an empty alternative", () => {
    for (const range of ["*", "^1.2.3 ||", "x"]) {
      const result = checkVersions(range, parseVersionList("1.0.0 2.0.0-beta"));
      expect(result.checks.map((c) => [c.version.input, c.matches])).toEqual([["2.0.0-beta", false], ["1.0.0", true]]);
    }
  });

  it("agrees with node-semver on every version and range", () => {
    const ranges = ["^1.2.3", "~1.2", "^0.2.3", "^0.0.3", "1.x", "*", ">=1.2.3-beta.1 <2", "^1.2.3-beta.2", "1.2.3 - 2.3", "^1.2.3 || ^3.0.0-rc.1", "<1.0.0", ">2.0.0 <1.0.0", "~1.2.3-alpha"];
    const versions = parseVersionList("0.2.3 0.2.9 0.3.0 0.0.3 0.0.4 1.0.0 1.2.2 1.2.3 1.2.3-beta.1 1.2.3-beta.3 1.2.4-alpha 1.3.0-beta 1.10.0 2.0.0-0 2.0.0-rc.1 2.0.0 2.3.9 2.4.0 3.0.0-rc.2 3.1.0");
    for (const range of ranges) {
      for (const includePrerelease of [false, true]) {
        const result = checkVersions(range, versions, { includePrerelease });
        for (const check of result.checks) {
          const v = check.version.ok ? check.version.version : "";
          expect([range, v, includePrerelease, check.matches]).toEqual([range, v, includePrerelease, satisfies(v, range, { loose: true, includePrerelease })]);
        }
      }
    }
  });

  it("says which alternative a version fits", () => {
    const result = checkVersions("^1.2.3 || ^3.0.0", parseVersionList("3.1.0 2.0.0"));
    expect(result.checks.map((c) => c.reason)).toEqual(["Fits ^3.0.0", "Fits neither ^1.2.3 nor ^3.0.0"]);
  });
});

describe("compareVersions", () => {
  it("orders by precedence and names the change", () => {
    expect(compareVersions("1.2.3", "2.0.0")).toMatchObject({ ok: true, order: -1, change: "major" });
    expect(compareVersions("1.10.0", "1.9.0")).toMatchObject({ ok: true, order: 1, change: "minor" });
    expect(compareVersions("1.2.3-beta", "1.2.3")).toMatchObject({ ok: true, order: -1, change: "patch" });
    expect(compareVersions("1.2.3-alpha", "1.2.3-beta")).toMatchObject({ ok: true, order: -1, change: "prerelease" });
  });

  it("treats versions differing only in build metadata as equal", () => {
    expect(compareVersions("1.2.3+a", "1.2.3+b")).toMatchObject({ ok: true, a: "1.2.3+a", b: "1.2.3+b", order: 0, change: null, note: expect.stringMatching(/build/i) });
  });

  it("reports which side is invalid", () => {
    expect(compareVersions("nope", "1.0.0")).toMatchObject({ ok: false, side: "a" });
    expect(compareVersions("1.0.0", "")).toMatchObject({ ok: false, side: "b" });
  });
});

describe("bumpVersion", () => {
  it("gives the next versions", () => {
    expect(bumpVersion("1.2.3", "beta")).toEqual([
      { label: "Major", version: "2.0.0" },
      { label: "Minor", version: "1.3.0" },
      { label: "Patch", version: "1.2.4" },
      { label: "Prerelease", version: "1.2.4-beta.0" },
    ]);
  });

  it("numbers prereleases without a tag, and refuses an invalid one", () => {
    expect(bumpVersion("1.2.3", "")?.[3]).toEqual({ label: "Prerelease", version: "1.2.4-0" });
    expect(bumpVersion("1.2.3", "be ta")).toBeNull();
  });

  it("releases a prerelease and continues its numbering", () => {
    expect(bumpVersion("2.0.0-rc.1", "rc")).toEqual([
      { label: "Major", version: "2.0.0" },
      { label: "Minor", version: "2.0.0" },
      { label: "Patch", version: "2.0.0" },
      { label: "Prerelease", version: "2.0.0-rc.2" },
    ]);
  });
});

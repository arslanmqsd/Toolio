import { describe, expect, it } from "vitest";
import { formulaNotice, isFormulaCell, writeCsv } from "./write";

describe("writeCsv", () => {
  it("quotes only fields with the delimiter, quotes or line breaks", () => {
    expect(writeCsv([["a", "b,c", 'say "hi"', "two\nlines"]], ",", false)).toBe('a,"b,c","say ""hi""","two\nlines"\n');
    expect(writeCsv([["a,b", "c;d"]], ";", true)).toBe('a,b;"c;d"\r\n');
  });
});

describe("isFormulaCell", () => {
  it("flags what a spreadsheet would run, but not plain numbers", () => {
    expect(["=SUM(A1)", "+cmd", "-x", "@here", "\tx"].every(isFormulaCell)).toBe(true);
    expect(["-5", "+1.5", "1e3", "a=b", ""].some(isFormulaCell)).toBe(false);
  });
});

describe("formulaNotice", () => {
  it("is info when escaped and a warning when not", () => {
    expect(formulaNotice(1, true)).toEqual({ kind: "info", message: "1 cell starts with ', so a spreadsheet opens it as text rather than running a formula." });
    expect(formulaNotice(2, false).kind).toBe("warning");
  });
});

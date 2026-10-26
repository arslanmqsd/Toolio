import { describe, expect, it } from "vitest";
import { MAX_PIXELS, exportScale, imageName } from "./pdf-to-image";

describe("exportScale", () => {
  it("turns DPI into a scale over PDF points", () => {
    expect(exportScale(612, 792, 72)).toBe(1);
    expect(exportScale(612, 792, 150)).toBeCloseTo(150 / 72);
    expect(exportScale(595, 842, 300)).toBeCloseTo(300 / 72);
  });

  it("shrinks pages that would go over the pixel budget", () => {
    // A0 poster at 300 DPI: about 9933 × 14043 pixels.
    const scale = exportScale(2384, 3370, 300);
    expect(scale).toBeLessThan(300 / 72);
    expect(2384 * scale * 3370 * scale).toBeCloseTo(MAX_PIXELS, -2);
  });

  it("keeps the shape when it shrinks", () => {
    const scale = exportScale(1000, 100, 100, 10_000);
    expect(1000 * scale * (100 * scale)).toBeCloseTo(10_000);
  });

  it("leaves a page that fits exactly alone", () => {
    expect(exportScale(100, 100, 72, 10_000)).toBe(1);
  });
});

describe("imageName", () => {
  it("names images after the PDF and page", () => {
    expect(imageName("report.pdf", 3, 9, "png")).toBe("report-page-3.png");
    expect(imageName("Report.PDF", 1, 1, "jpg")).toBe("Report-page-1.jpg");
  });

  it("pads page numbers so files sort in order", () => {
    expect(imageName("a.pdf", 7, 12, "jpg")).toBe("a-page-07.jpg");
    expect(imageName("a.pdf", 42, 120, "png")).toBe("a-page-042.png");
    expect(imageName("a.pdf", 120, 120, "png")).toBe("a-page-120.png");
  });

  it("keeps other dots and falls back when the name is only an extension", () => {
    expect(imageName("v1.2 notes.pdf", 2, 2, "png")).toBe("v1.2 notes-page-2.png");
    expect(imageName(".pdf", 1, 1, "png")).toBe("document-page-1.png");
  });
});

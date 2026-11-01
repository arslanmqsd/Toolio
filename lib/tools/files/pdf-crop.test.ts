import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { NO_CROP, MIN_SHARE, clampMargins, contentMargins, cropPages, padMargins, unionMargins } from "./pdf-crop";

async function sample(rotation = 0) {
  const doc = await PDFDocument.create();
  doc.addPage([200, 400]).setRotation(degrees(rotation));
  doc.addPage([200, 400]);
  return doc.save();
}

const cropBox = async (bytes: Uint8Array, page = 0) => {
  const box = (await PDFDocument.load(bytes)).getPage(page).getCropBox();
  return [box.x, box.y, box.width, box.height].map((v) => Math.round(v * 100) / 100);
};

describe("cropPages", () => {
  it("cuts each side by its share of the page", async () => {
    const out = await cropPages(await sample(), [{ page: 0, margins: { top: 0.1, right: 0.2, bottom: 0.05, left: 0.1 } }]);
    // 200 × 400: left 20, right 40, bottom 20, top 40.
    expect(await cropBox(out)).toEqual([20, 20, 140, 340]);
  });

  it("leaves pages that aren't listed alone", async () => {
    const out = await cropPages(await sample(), [{ page: 0, margins: { ...NO_CROP, top: 0.5 } }]);
    expect(await cropBox(out, 1)).toEqual([0, 0, 200, 400]);
  });

  it("crops every listed page", async () => {
    const margins = { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 };
    const out = await cropPages(await sample(), [
      { page: 0, margins },
      { page: 1, margins },
    ]);
    expect(await cropBox(out, 1)).toEqual([20, 40, 160, 320]);
  });

  it("measures margins on a turned page as it's seen", async () => {
    // Turned 90° clockwise, the 200 × 400 page is seen 400 wide and 200 tall, its left edge at the top.
    const out = await cropPages(await sample(90), [{ page: 0, margins: { ...NO_CROP, top: 0.25 } }]);
    expect(await cropBox(out)).toEqual([50, 0, 150, 400]);
  });

  it("measures the seen left on a page turned 270°", async () => {
    // At 270° the seen left edge is the page's top.
    const out = await cropPages(await sample(270), [{ page: 0, margins: { ...NO_CROP, left: 0.25 } }]);
    expect(await cropBox(out)).toEqual([0, 0, 200, 300]);
  });

  it("crops inside an existing crop box", async () => {
    const doc = await PDFDocument.load(await sample());
    doc.getPage(0).setCropBox(50, 100, 100, 200);
    const out = await cropPages(await doc.save(), [{ page: 0, margins: { ...NO_CROP, left: 0.5 } }]);
    expect(await cropBox(out)).toEqual([100, 100, 50, 200]);
  });
});

describe("clampMargins", () => {
  it("keeps sensible margins as they are", () => {
    expect(clampMargins({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.1 })).toEqual({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.1 });
  });

  it("raises negative margins to zero", () => {
    expect(clampMargins({ top: -0.1, right: 0, bottom: 0, left: -1 })).toEqual(NO_CROP);
  });

  it("always leaves some page between opposite sides", () => {
    const m = clampMargins({ top: 0.7, right: 0, bottom: 0.7, left: 0 });
    expect(1 - m.top - m.bottom).toBeCloseTo(MIN_SHARE);
    expect(m.top).toBeCloseTo(m.bottom);
  });
});

/** A width × height white picture with a black block from (x1, y1) to (x2, y2), inclusive. */
function picture(width: number, height: number, block?: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  if (block) {
    const [x1, y1, x2, y2] = block;
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) pixels.set([0, 0, 0, 255], (y * width + x) * 4);
  }
  return pixels;
}

describe("contentMargins", () => {
  it("finds the blank paper round the content", () => {
    expect(contentMargins(picture(10, 20, [2, 4, 6, 15]), 10, 20)).toEqual({ top: 0.2, right: 0.3, bottom: 0.2, left: 0.2 });
  });

  it("is null for a blank page", () => {
    expect(contentMargins(picture(10, 10), 10, 10)).toBeNull();
  });

  it("treats near-white specks as paper", () => {
    const pixels = picture(10, 10, [5, 5, 5, 5]);
    pixels.set([245, 245, 245, 255], 0);
    expect(contentMargins(pixels, 10, 10)).toEqual({ top: 0.5, right: 0.4, bottom: 0.4, left: 0.5 });
  });

  it("treats see-through pixels as paper", () => {
    const pixels = picture(10, 10, [5, 5, 5, 5]);
    pixels.set([0, 0, 0, 0], 0);
    expect(contentMargins(pixels, 10, 10)?.left).toBe(0.5);
  });
});

describe("unionMargins and padMargins", () => {
  it("keeps what either page needs", () => {
    expect(unionMargins({ top: 0.1, right: 0.3, bottom: 0.2, left: 0.4 }, { top: 0.2, right: 0.1, bottom: 0.3, left: 0.1 })).toEqual({
      top: 0.1,
      right: 0.1,
      bottom: 0.2,
      left: 0.1,
    });
  });

  it("pads outwards but never past the edge", () => {
    const m = padMargins({ top: 0.1, right: 0.01, bottom: 0.2, left: 0 }, 0.02);
    expect([m.top, m.right, m.bottom, m.left].map((v) => Math.round(v * 100) / 100)).toEqual([0.08, 0, 0.18, 0]);
  });
});

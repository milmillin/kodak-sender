import { describe, expect, it } from "vitest";
import { clampTransform, coverTransform, snapTransform } from "../pipeline/compose";
import { autoLayout, frameSize, layoutTransform, manualCrop, resizeAndCropExact, type DownscaleMode } from "../pipeline/resizeCrop";
import { dpidDownscale, dpidWindow, stbirResize, stbirWindow } from "../pipeline/downscale";
import { ResizeCache } from "../pipeline/resizeCache";
import { MODELS } from "../pipeline/models";

/** Smooth, asymmetric test image, so a wrong rotation or offset shows up as a large difference. */
function image(w: number, h: number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    d[i] = (x / w) * 255; d[i + 1] = (y / h) * 255; d[i + 2] = ((x + 2 * y) / (w + 2 * h)) * 255; d[i + 3] = 255;
  }
  return d;
}
const meanAbsDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length;
};

const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`byte ${i}: ${a[i]} vs ${b[i]}`);
};

describe("windowed resize", () => {
  const sw = 700, sh = 500, src = image(sw, sh);
  const slice = (full: Uint8ClampedArray, W: number, x: number, y: number, w: number, h: number) => {
    const o = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) o.set(full.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4), r * w * 4);
    return o;
  };
  it("dpid window equals the same region of a full resize", () => {
    for (const lam of [0, 1, 1.4]) same(dpidWindow(src, sw, sh, 301, 207, 37, 51, 120, 90, lam), slice(dpidDownscale(src, sw, sh, 301, 207, lam), 301, 37, 51, 120, 90));
  });
  it("stb window equals the same region of a full resize", () => {
    same(stbirWindow(src, sw, sh, 301, 207, 37, 51, 120, 90), slice(stbirResize(src, sw, sh, 301, 207), 301, 37, 51, 120, 90));
  });
});

describe("manual crop", () => {
  it.each([
    ["D662 portrait", 0, 900, 1500], ["D662 landscape", 0, 1500, 900],
    ["square model portrait", 1, 1000, 1300], ["square model landscape", 1, 1300, 1000],
  ])("the auto crop's framing reproduces it exactly: %s", (_, mi, sw, sh) => {
    const m = MODELS[mi], src = { width: sw, height: sh, pixels: image(sw, sh) };
    for (const mode of ["dpid", "stbir"] as DownscaleMode[]) {
      const ds = { mode, lambda: 1 };
      const manual = manualCrop(src, m.rw, m.rh, 1, ds, layoutTransform(autoLayout(sw, sh, m.rw, m.rh, 1), sw));
      same(manual, resizeAndCropExact(src, m.rw, m.rh, 1, ds));
    }
  });

  it("panning moves the crop", () => {
    const ds = { mode: "dpid" as const, lambda: 1 };
    const m = MODELS[0], sw = 2000, sh = 1500, src = { width: sw, height: sh, pixels: image(sw, sh) };
    const { fw, fh } = frameSize(m.rw, m.rh, 1, true);
    const c = coverTransform(sw, sh, fw, fh);
    const top = manualCrop(src, m.rw, m.rh, 1, ds, clampTransform({ ...c, ty: 0 }, sw, sh, fw, fh)); // width is exactly filled; only y can move
    const centre = manualCrop(src, m.rw, m.rh, 1, ds, c);
    expect(meanAbsDiff(top, centre)).toBeGreaterThan(5);
  });
});

describe("resize cache", () => {
  const m = MODELS[0], sw = 1800, sh = 2600, src = { width: sw, height: sh, pixels: image(sw, sh) };
  const { fw, fh } = frameSize(m.rw, m.rh, 1, false);
  it("cached results are identical to uncached ones, and pans hit", () => {
    const cache = new ResizeCache();
    const ds = { mode: "dpid" as const, lambda: 1 };
    same(resizeAndCropExact(src, m.rw, m.rh, 1, ds, cache), resizeAndCropExact(src, m.rw, m.rh, 1, ds));
    same(resizeAndCropExact(src, m.rw, m.rh, 1, ds, cache), resizeAndCropExact(src, m.rw, m.rh, 1, ds));
    expect(cache.hits).toBe(1);
    const zoomed = clampTransform({ scale: coverTransform(sw, sh, fw, fh).scale * 1.6, tx: -200, ty: -300 }, sw, sh, fw, fh);
    for (const [dx, dy] of [[0, 0], [37, -12], [-80, 41], [150, 260]]) {
      const t = clampTransform({ ...zoomed, tx: zoomed.tx + dx, ty: zoomed.ty + dy }, sw, sh, fw, fh);
      same(manualCrop(src, m.rw, m.rh, 1, ds, t, cache), manualCrop(src, m.rw, m.rh, 1, ds, t));
    }
    expect(cache.hits).toBeGreaterThanOrEqual(3); // the zoom misses once, nearby pans hit
  });
  it("different downscale settings don't share entries", () => {
    const cache = new ResizeCache();
    resizeAndCropExact(src, m.rw, m.rh, 1, { mode: "dpid", lambda: 1 }, cache);
    same(resizeAndCropExact(src, m.rw, m.rh, 1, { mode: "dpid", lambda: 0.5 }, cache), resizeAndCropExact(src, m.rw, m.rh, 1, { mode: "dpid", lambda: 0.5 }));
    same(resizeAndCropExact(src, m.rw, m.rh, 1, { mode: "stbir", lambda: 1 }, cache), resizeAndCropExact(src, m.rw, m.rh, 1, { mode: "stbir", lambda: 1 }));
    expect(cache.hits).toBe(0);
  });
});

describe("framing", () => {
  const sw = 3000, sh = 2000, fw = 1000, fh = 625;
  it("frame follows the auto crop's orientation", () => {
    expect(frameSize(640, 1024, 1, false)).toEqual({ fw: 625, fh: 1000 });
    expect(frameSize(640, 1024, 1, true)).toEqual({ fw: 1000, fh: 625 });
  });
  it("clamp keeps the frame covered", () => {
    const t = clampTransform({ scale: 0.01, tx: 500, ty: -9999 }, sw, sh, fw, fh);
    expect(t.scale).toBeCloseTo(Math.max(fw / sw, fh / sh));
    expect(t.tx).toBeLessThanOrEqual(0);
    expect(t.tx + sw * t.scale).toBeGreaterThanOrEqual(fw - 1e-9);
    expect(t.ty + sh * t.scale).toBeGreaterThanOrEqual(fh - 1e-9);
  });
  it("snaps to the centre lines within tolerance only", () => {
    const c = coverTransform(sw, sh, fw, fh);
    const zoomed = clampTransform({ scale: c.scale * 2, tx: -400, ty: -300 }, sw, sh, fw, fh);
    const centred = { ...zoomed, tx: fw / 2 - (sw * zoomed.scale) / 2, ty: fh / 2 - (sh * zoomed.scale) / 2 };
    const near = snapTransform({ ...centred, tx: centred.tx + 4, ty: centred.ty - 30 }, sw, sh, fw, fh, 8);
    expect(near.x).toBe(true);
    expect(near.y).toBe(false);
    expect(near.t.tx).toBeCloseTo(centred.tx);
    expect(near.t.ty).toBeCloseTo(centred.ty - 30);
  });
  it("snaps zoom to fill", () => {
    const c = coverTransform(sw, sh, fw, fh);
    const s = snapTransform({ ...c, scale: c.scale * 1.001 }, sw, sh, fw, fh, 8);
    expect(s.t.scale).toBe(c.scale);
  });
});

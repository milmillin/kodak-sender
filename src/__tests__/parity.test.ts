import { describe, expect, it } from "vitest";
import { legacy, setLegacySource } from "./legacy";
import { dpidDownscale, stbirResize } from "../pipeline/downscale";
import { cropFromResized, cropSize, resizeAndCropExact, resizeTarget, type DownscaleMode } from "../pipeline/resizeCrop";
import { sharpen } from "../pipeline/sharpen";
import { colorLUT, toneLUT } from "../pipeline/color";
import { thcSAC } from "../pipeline/thc";
import { borderEdges, MODELS } from "../pipeline/models";
import { processPixels } from "../pipeline/run";
import { DEFAULT_SETTINGS } from "../pipeline/settings";

/** Deterministic test image: gradients + edges + noise (exercises sharpen/LUT branches). */
function image(w: number, h: number, seed = 1) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, edge = ((x >> 5) + (y >> 5)) & 1 ? 60 : 0;
    d[i] = (x / w) * 255 - edge + rnd() * 30;
    d[i + 1] = (y / h) * 255 + edge - rnd() * 30;
    d[i + 2] = 128 + 100 * Math.sin(x / 13) * Math.cos(y / 17) + rnd() * 20;
    d[i + 3] = 255;
  }
  return d;
}

function same(a: ArrayLike<number>, b: ArrayLike<number>) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) {
    throw new Error(`byte ${i} differs: ported ${a[i]} vs original ${b[i]}`);
  }
}

describe("pipeline parity with send.html", () => {
  it("dpidDownscale", () => {
    const src = image(300, 200);
    for (const lam of [0, 1, 1.7]) same(dpidDownscale(src, 300, 200, 97, 61, lam), legacy.dpidDownscale(src, 300, 200, 97, 61, lam));
  });

  it("stbirResize", () => {
    const src = image(300, 200);
    same(stbirResize(src, 300, 200, 97, 61), legacy.stbirResize(src, 300, 200, 97, 61));
  });

  // Crop/rotate/flip/shrink math in isolation: legacy's bilinear branch reads its resized pixels back from
  // the (fake) canvas, so both sides get the same pre-resized buffer.
  it("crop math: every model × chip × source orientation", () => {
    let checked = 0;
    for (const m of MODELS) for (const [sw, sh] of [[3000, 4000], [4000, 3000], [3500, 3500], [1001, 1777]]) {
      for (const chip of [0, 1, 2]) {
        const { cropW, cropH } = cropSize(m.rw, m.rh, chip);
        const { rW, rH } = resizeTarget(sw, sh, cropW, cropH);
        const R = image(rW, rH, rW * 31 + rH);
        setLegacySource(R);
        legacy.DS.mode = "bilinear";
        const ported = cropFromResized(R, rW, rH, sh < sw, m.rw, m.rh, chip);
        same(ported, legacy.resizeAndCropExact({}, sw, sh, m.rw, m.rh, chip).data);
        checked++;
      }
    }
    expect(checked).toBe(48);
  });

  it("resizeAndCropExact end to end (dpid + stbir)", () => {
    for (const mode of ["dpid", "stbir"] as DownscaleMode[]) for (const [sw, sh] of [[700, 1100], [1100, 700]]) {
      const src = image(sw, sh, sw);
      setLegacySource(src);
      legacy.DS.mode = mode; legacy.DS.lambda = 1;
      same(resizeAndCropExact({ width: sw, height: sh, pixels: src }, 640, 1024, 1, { mode, lambda: 1 }),
        legacy.resizeAndCropExact({}, sw, sh, 640, 1024, 1).data);
    }
  });

  it("sharpen (high-pass + USM)", () => {
    for (const [hp, usm] of [[0.6, 0.5], [0, 1.2], [1.5, 0]]) {
      const a = image(160, 120), b = a.slice();
      sharpen(a, 160, 120, hp, usm); legacy.sharpen(b, 160, 120, hp, usm);
      same(a, b);
    }
  });

  it("colorLUT", () => { const a = image(128, 96), b = a.slice(); colorLUT(a); legacy.colorLUT(b); same(a, b); });

  it("toneLUT, every family × chip", () => {
    for (const fam of [2, 3, 4, 6]) for (const chip of [0, 1, 2]) {
      const a = image(64, 64), b = a.slice(); toneLUT(a, fam, chip); legacy.toneLUT(b, fam, chip); same(a, b);
    }
  });

  it("thcSAC", () => { const a = image(160, 200), b = a.slice(); thcSAC(a, 160, 200); legacy.thcSAC(b, 160, 200); same(a, b); });

  it("borderEdges", () => {
    for (const m of MODELS) for (const chip of [0, 1]) expect(borderEdges(m.rw, m.rh, chip)).toEqual({ ...legacy.borderEdges(m.rw, m.rh, chip) });
  });

  it("full processPixels chain matches the original stage order (D662, chip 1)", () => {
    const sw = 900, sh = 1300, src = image(sw, sh, 7), m = MODELS[0];
    setLegacySource(src);
    legacy.DS.mode = DEFAULT_SETTINGS.dsMode; legacy.DS.lambda = DEFAULT_SETTINGS.dsLambda;
    const ported = processPixels({ width: sw, height: sh, pixels: src }, { profileIdx: 0, chip: 1, settings: DEFAULT_SETTINGS, transform: null });
    const d = legacy.resizeAndCropExact({}, sw, sh, m.rw, m.rh, 1).data;
    legacy.sharpen(d, m.rw, m.rh, 0.6, 0.5);
    legacy.colorLUT(d); legacy.toneLUT(d, m.family, 1); legacy.thcSAC(d, m.rw, m.rh);
    same(ported, d);
  });
});

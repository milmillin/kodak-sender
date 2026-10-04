import { clamp8 } from "./models";
import { LUT1D, LUT3D } from "./lut";

/** 3D color LUT — EXACT trilinear interpolation, matches apply_lut / FUN_001bd3d0. */
export function colorLUT(data: Uint8ClampedArray) {
  const L = LUT3D;
  for (let p = 0; p < data.length; p += 4) {
    const R = data[p], G = data[p + 1], B = data[p + 2];
    let hr = ((R * 32) / 255) | 0, fr = (R * 32) % 255; if (hr > 31) { hr = 31; fr = 255; }
    let hg = ((G * 32) / 255) | 0, fg = (G * 32) % 255; if (hg > 31) { hg = 31; fg = 255; }
    let hb = ((B * 32) / 255) | 0, fb = (B * 32) % 255; if (hb > 31) { hb = 31; fb = 255; }
    const i000 = ((hb * 1089) + (hg * 33) + hr) * 3;
    const i100 = i000 + 3, i010 = i000 + 99, i110 = i010 + 3;
    const i001 = i000 + 3267, i101 = i001 + 3, i011 = i001 + 99, i111 = i011 + 3;
    for (let c = 0; c < 3; c++) {
      const a00 = L[i000 + c] + (((L[i100 + c] - L[i000 + c]) * fr + 128) >> 8);
      const a10 = L[i010 + c] + (((L[i110 + c] - L[i010 + c]) * fr + 128) >> 8);
      const a0 = a00 + (((a10 - a00) * fg + 128) >> 8);
      const a01 = L[i001 + c] + (((L[i101 + c] - L[i001 + c]) * fr + 128) >> 8);
      const a11 = L[i011 + c] + (((L[i111 + c] - L[i011 + c]) * fr + 128) >> 8);
      const a1 = a01 + (((a11 - a01) * fg + 128) >> 8);
      data[p + c] = clamp8(a0 + (((a1 - a0) * fb + 128) >> 8));
    }
  }
}

export function pick1D(family: number, chip: number) {
  if (chip === 1) return family === 2 ? "c1_m2" : family === 3 ? "c1_m3" : family === 4 ? "c1_m4" : "c1_def";
  if (chip === 2) return (family === 2 || family === 3) ? "c2_m23" : "c2_def";
  return "c0"; // chip 0 → identity
}

/** 1D tone curve — EXACT per-channel C/M/Y table, matches apply_1d_lut / read_1D_lut. */
export function toneLUT(data: Uint8ClampedArray, family: number, chip: number) {
  const t = LUT1D[pick1D(family, chip)];
  for (let p = 0; p < data.length; p += 4) {
    data[p] = t[data[p] * 3];
    data[p + 1] = t[data[p + 1] * 3 + 1];
    data[p + 2] = t[data[p + 2] * 3 + 2];
  }
}

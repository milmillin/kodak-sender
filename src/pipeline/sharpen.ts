// EXACT sharpen: sharpen_highpass5 + sharpenUSM.
import { clamp8 } from "./models";
import { RANGE } from "./lut";

// --- float BT.601 JPEG YCbCr round trip (used only by highpass5) ---
function rgb2ycbcrF(r: number, g: number, b: number) {
  return [0.299 * r + 0.587 * g + 0.114 * b,
    128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    128 + 0.5 * r - 0.418688 * g - 0.081312 * b];
}
function ycbcr2rgbF(Y: number, Cb: number, Cr: number) {
  const cb = Cb - 128, cr = Cr - 128;
  return [clamp8(Y + 1.402 * cr), clamp8(Y - 0.344136 * cb - 0.714136 * cr), clamp8(Y + 1.772 * cb)];
}
const tdiv4 = (v: number) => (v + (v >= 0 ? 0 : 3)) >> 2; // trunc toward zero /4, matches binary

/** sharpen_highpass5: 5×5 Laplacian high-pass on luma, blended by highpass_apply. */
export function sharpenHighpass5(data: Uint8ClampedArray, w: number, h: number, s2: number) {
  const Y = new Uint8Array(w * h), Cb = new Uint8Array(w * h), Cr = new Uint8Array(w * h);
  for (let p = 0, q = 0; q < w * h; q++, p += 4) {
    const y = rgb2ycbcrF(data[p], data[p + 1], data[p + 2]);
    Y[q] = y[0] | 0; Cb[q] = y[1] | 0; Cr[q] = y[2] | 0; // (int) truncation as in convert_ycbcr
  }
  const hp = new Uint8Array(w * h).fill(127); // memset 0x7f; borders stay 127
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let acc = 0;
      for (let ky = -2; ky <= 2; ky++) for (let kx = -2; kx <= 2; kx++)
        acc += Y[(y + ky) * w + (x + kx)] * ((ky === 0 && kx === 0) ? 24 : -1);
      hp[y * w + x] = clamp8(tdiv4(acc) + 127);
    }
  }
  for (let q = 0, p = 0; q < w * h; q++, p += 4) {
    const yv = Y[q], H = hp[q];
    let v = (yv / 255) * (yv + (H * 2 / 255) * (255 - yv)); // highpass_apply
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    const yNew = (yv * (1 - s2) + v * s2) | 0; // blend, (int) truncation
    const rgb = ycbcr2rgbF(yNew, Cb[q], Cr[q]);
    data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2];
  }
}

/** 1-channel recursive bilateral on the Y plane (Yang), matches recursiveBilateral. */
export function recursiveBilateral(Yin: Uint8Array, w: number, h: number) {
  const SS = 1.0; // sigma_spatial
  const alpha = (Math.exp(-1.4142135 / SS) * 16384 + 0.5) | 0;
  const na = 16384 - alpha;
  const tmp = new Int32Array(w * h), out = new Uint8Array(w * h);
  // horizontal
  for (let y = 0; y < h; y++) {
    const r = y * w;
    tmp[r] = Yin[r];
    for (let x = 1; x < w; x++) {
      const cur = Yin[r + x], prev = Yin[r + x - 1], pf = tmp[r + x - 1];
      const wr = RANGE[Math.abs(prev - cur)];
      const inner = (wr * cur + (16384 - wr) * pf) >> 14;
      let v = (alpha * pf + na * inner) >> 14; v = v < 0 ? 0 : v > 255 ? 255 : v;
      tmp[r + x] = v;
    }
    for (let x = w - 2; x >= 0; x--) {
      const cur = Yin[r + x], nxt = Yin[r + x + 1];
      const wr = RANGE[Math.abs(nxt - cur)];
      const inner = (wr * tmp[r + x] + (16384 - wr) * nxt) >> 14;
      let v = (alpha * tmp[r + x + 1] + na * inner) >> 14; v = v < 0 ? 0 : v > 255 ? 255 : v;
      tmp[r + x] = v;
    }
  }
  // vertical
  for (let x = 0; x < w; x++) {
    out[x] = tmp[x];
    for (let y = 1; y < h; y++) {
      const i = y * w + x, pi = (y - 1) * w + x;
      const cur = tmp[i], prev = tmp[pi], pf = out[pi];
      const wr = RANGE[Math.abs(prev - cur)];
      const inner = (wr * cur + (16384 - wr) * pf) >> 14;
      let v = (alpha * pf + na * inner) >> 14; v = v < 0 ? 0 : v > 255 ? 255 : v;
      out[i] = v;
    }
    for (let y = h - 2; y >= 0; y--) {
      const i = y * w + x, ni = (y + 1) * w + x;
      const cur = tmp[i], nxt = tmp[ni];
      const wr = RANGE[Math.abs(nxt - cur)];
      const inner = (wr * out[i] + (16384 - wr) * nxt) >> 14;
      let v = (alpha * out[ni] + na * inner) >> 14; v = v < 0 ? 0 : v > 255 ? 255 : v;
      out[i] = v;
    }
  }
  return out;
}

// integer YCC round trip (rgb_to_ycc / ycc_to_rgb)
function rgb2yccI(r: number, g: number, b: number) {
  const Y = (r * 0x4d + g * 0x96 + b * 0x1d) >> 8;
  const a = ((r * 0x80 - g * 0x6b - b * 0x15) >> 8) + 0x80; // stored at +1
  const c = ((-r * 0x2b - g * 0x55 + b * 0x80) >> 8) + 0x80; // stored at +2
  return [clamp8(Y), clamp8(a), clamp8(c)];
}
function ycc2rgbI(Y: number, A: number, C: number) {
  const a = A - 0x80, c = C - 0x80;
  const R = Y + ((a * 0x167) >> 8);
  const G = Y - (((c * 0x58) + (a * 0xb7)) >> 8);
  const B = Y + ((c * 0x1c6) >> 8);
  return [clamp8(R), clamp8(G), clamp8(B)];
}

/** sharpenUSM: bilateral unsharp mask on luma with saturation preservation. */
export function sharpenUSM(data: Uint8ClampedArray, w: number, h: number, s1 = 8192 /* round(0.5*16384) */) {
  const contrast = 50, threshold = 15;
  const Yp = new Uint8Array(w * h), Ap = new Uint8Array(w * h), Cp = new Uint8Array(w * h);
  for (let q = 0, p = 0; q < w * h; q++, p += 4) {
    const y = rgb2yccI(data[p], data[p + 1], data[p + 2]); Yp[q] = y[0]; Ap[q] = y[1]; Cp[q] = y[2];
  }
  const blur = recursiveBilateral(Yp, w, h);
  for (let q = 0; q < w * h; q++) {
    const Y = Yp[q];
    let e = Y - blur[q];
    if (e < -contrast) e = -contrast; else if (e > contrast) e = contrast;
    let nY = Y + ((s1 * e) >> 14); nY = nY < 0 ? 0 : nY > 255 ? 255 : nY;
    Yp[q] = nY;
    if (threshold < Y) { // chroma: preserve saturation under luma boost
      const cr = Ap[q] - 0x80, cb = Cp[q] - 0x80;
      if (cr * cr + cb * cb > 100) {
        let f8 = Y; if (f8 < 2) f8 = 1;
        const ratio = (((nY - Y) * 0x2000 + (f8 >> 1)) / f8) | 0;
        let scale = ratio + 0x4000;
        if (scale < 0x3333) scale = 0x3333; else if (scale > 0x4ccd) scale = 0x4ccd;
        Ap[q] = clamp8(((cr * scale + 0x2000) >> 14) + 0x80);
        Cp[q] = clamp8(((cb * scale + 0x2000) >> 14) + 0x80);
      }
    }
  }
  for (let q = 0, p = 0; q < w * h; q++, p += 4) {
    const rgb = ycc2rgbI(Yp[q], Ap[q], Cp[q]); data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2];
  }
}

/** amtHP = high-pass blend (0..1.5), amtUSM = USM strength (0..1.5). */
export function sharpen(data: Uint8ClampedArray, w: number, h: number, amtHP: number, amtUSM = 0.5) {
  if (amtHP > 0) sharpenHighpass5(data, w, h, amtHP);
  if (amtUSM > 0) sharpenUSM(data, w, h, (amtUSM * 16384 + 0.5) | 0);
}

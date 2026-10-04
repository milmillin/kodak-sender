// DPID = "Rapid, Detail-Preserving Image Downscaling", Weber et al. 2016.
// For each output pixel: take the coverage-weighted average over its source footprint, then
// re-average weighting each source pixel by its colour distance from that average, raised to λ.
// λ=0 → plain area average; higher λ keeps more local detail/contrast.
//
// The *Window variants compute only the output pixels [wx,wx+ww)×[wy,wy+wh) of the virtual dw×dh
// image, with the full image's scale — byte-identical to the same region of a full resize.

export function dpidWindow(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number,
  wx: number, wy: number, ww: number, wh: number, lambda: number) {
  const out = new Uint8ClampedArray(ww * wh * 4);
  const sxr = sw / dw, syr = sh / dh, lam1 = lambda === 1;
  for (let j = 0; j < wh; j++) {
    const oy = wy + j;
    const y0 = oy * syr, y1 = y0 + syr, iy0 = Math.floor(y0), iy1 = Math.min(sh - 1, Math.ceil(y1) - 1);
    for (let i = 0; i < ww; i++) {
      const ox = wx + i;
      const x0 = ox * sxr, x1 = x0 + sxr, ix0 = Math.floor(x0), ix1 = Math.min(sw - 1, Math.ceil(x1) - 1);
      let ar = 0, ag = 0, ab = 0, aw = 0;
      for (let y = iy0; y <= iy1; y++) {
        const cy = Math.min(y1, y + 1) - Math.max(y0, y); if (cy <= 0) continue; const row = y * sw;
        for (let x = ix0; x <= ix1; x++) {
          const cx = Math.min(x1, x + 1) - Math.max(x0, x); if (cx <= 0) continue;
          const c = cx * cy, k = (row + x) << 2; ar += src[k] * c; ag += src[k + 1] * c; ab += src[k + 2] * c; aw += c;
        }
      }
      const o = (j * ww + i) << 2;
      if (aw <= 0) { out[o + 3] = 255; continue; }
      const mr = ar / aw, mg = ag / aw, mb = ab / aw;
      let wr = 0, wg = 0, wb = 0, ws = 0;
      for (let y = iy0; y <= iy1; y++) {
        const cy = Math.min(y1, y + 1) - Math.max(y0, y); if (cy <= 0) continue; const row = y * sw;
        for (let x = ix0; x <= ix1; x++) {
          const cx = Math.min(x1, x + 1) - Math.max(x0, x); if (cx <= 0) continue;
          const k = (row + x) << 2, dr = src[k] - mr, dg = src[k + 1] - mg, db = src[k + 2] - mb;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          const w = cx * cy * (lam1 ? dist : Math.pow(dist, lambda));
          wr += src[k] * w; wg += src[k + 1] * w; wb += src[k + 2] * w; ws += w;
        }
      }
      if (ws > 0) { out[o] = wr / ws; out[o + 1] = wg / ws; out[o + 2] = wb / ws; }
      else { out[o] = mr; out[o + 1] = mg; out[o + 2] = mb; }
      out[o + 3] = 255;
    }
  }
  return out;
}

export const dpidDownscale = (src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number, lambda: number) =>
  dpidWindow(src, sw, sh, dw, dh, 0, 0, dw, dh, lambda);

// stbir — matches the app's stbir_resize_uint8_srgb: separable Mitchell filter (B=C=1/3), the
// stb_image_resize2 default for downsampling, applied in linear light with sRGB in/out and edge clamp.
const STB_L = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; STB_L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

function lin2srgb8(l: number) {
  if (l <= 0) return 0; if (l >= 1) return 255;
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return (s * 255 + 0.5) | 0;
}

function mitchell(x: number) {
  x = x < 0 ? -x : x; const B = 1 / 3, C = 1 / 3;
  if (x < 1) return ((12 - 9 * B - 6 * C) * x * x * x + (-18 + 12 * B + 6 * C) * x * x + (6 - 2 * B)) / 6;
  if (x < 2) return ((-B - 6 * C) * x * x * x + (6 * B + 30 * C) * x * x + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6;
  return 0;
}

interface Taps { idx: number[]; wt: number[] }

/** Filter taps for output index o (matches stbWeights in send.html, one output at a time). */
function stbTaps(inN: number, outN: number, o: number): Taps {
  const s = outN / inN, fscale = Math.max(1, 1 / s), support = 2 * fscale;
  const center = (o + 0.5) / s - 0.5, lo = Math.ceil(center - support), hi = Math.floor(center + support);
  const idx: number[] = [], wt: number[] = []; let sum = 0;
  for (let i = lo; i <= hi; i++) {
    const w = mitchell((i - center) / fscale); if (w === 0) continue;
    idx.push(i < 0 ? 0 : i >= inN ? inN - 1 : i); wt.push(w); sum += w;
  }
  for (let k = 0; k < wt.length; k++) wt[k] /= sum;
  return { idx, wt };
}

export function stbirWindow(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number,
  wx: number, wy: number, ww: number, wh: number) {
  const wX = Array.from({ length: ww }, (_, i) => stbTaps(sw, dw, wx + i));
  const wY = Array.from({ length: wh }, (_, j) => stbTaps(sh, dh, wy + j));
  // only the source rows the vertical taps touch get a horizontal pass
  let lo = sh, hi = -1;
  for (const W of wY) for (const y of W.idx) { if (y < lo) lo = y; if (y > hi) hi = y; }
  const tmp = new Float32Array(Math.max(0, hi - lo + 1) * ww * 3);
  for (let y = lo; y <= hi; y++) {
    const srow = y * sw * 4, trow = (y - lo) * ww * 3;
    for (let o = 0; o < ww; o++) {
      const W = wX[o], idx = W.idx, wt = W.wt; let r = 0, g = 0, b = 0;
      for (let k = 0; k < idx.length; k++) {
        const si = srow + (idx[k] << 2), w = wt[k];
        r += STB_L[src[si]] * w; g += STB_L[src[si + 1]] * w; b += STB_L[src[si + 2]] * w;
      }
      const ti = trow + o * 3; tmp[ti] = r; tmp[ti + 1] = g; tmp[ti + 2] = b;
    }
  }
  const out = new Uint8ClampedArray(ww * wh * 4);
  for (let j = 0; j < wh; j++) {
    const W = wY[j], idx = W.idx, wt = W.wt;
    for (let x = 0; x < ww; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < idx.length; k++) {
        const ti = ((idx[k] - lo) * ww + x) * 3, w = wt[k];
        r += tmp[ti] * w; g += tmp[ti + 1] * w; b += tmp[ti + 2] * w;
      }
      const oi = (j * ww + x) << 2;
      out[oi] = lin2srgb8(r); out[oi + 1] = lin2srgb8(g); out[oi + 2] = lin2srgb8(b); out[oi + 3] = 255;
    }
  }
  return out;
}

export const stbirResize = (src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number) =>
  stbirWindow(src, sw, sh, dw, dh, 0, 0, dw, dh);

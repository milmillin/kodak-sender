// EXACT resize_and_crop: calc_wh cover-resize → crop (with 90° rotation branch) → 180° flip for
// 1024-high output → chip-1 shrink pasted onto a white OW×OH canvas at the model-specific offsets.
import { dpidWindow, stbirWindow } from "./downscale";
import type { ResizeCache } from "./resizeCache";

export type DownscaleMode = "dpid" | "stbir" | "bilinear";
export interface Downscale { mode: DownscaleMode; lambda: number }

/** A decoded source image: raw RGBA pixels plus something drawImage() accepts. */
export interface Source {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  drawable?: CanvasImageSource;
}

export function cropSize(OW: number, OH: number, chip: number) {
  let cropW = OW, cropH = OH;
  if (chip === 1) {
    if (OH === 1024) { cropW = (OW * 0.977) | 0; cropH = (OH * 0.977) | 0; }
    else if (OH === 896) { cropW = (OW * 0.98) | 0; cropH = (OH * 0.98) | 0; }
    else if (OH === 1864) { cropW = (OW * 0.975) | 0; cropH = (OH * 0.975) | 0; }
  }
  return { cropW, cropH };
}

/** calc_wh target: the cover-resize size for the source. */
export function resizeTarget(sw: number, sh: number, cropW: number, cropH: number) {
  let l1c = cropW, l20 = cropH; if (sh < sw) { l1c = cropH; l20 = cropW; } // calc_wh target swap
  const scale = Math.min(sw / l1c, sh / l20);
  return { rW: (sw / scale + 0.5) | 0, rH: (sh / scale + 0.5) | 0 };
}

/**
 * Window (x,y,w,h) of the source resized to rW×rH. DPID/stb compute only the window, exactly; upscales
 * and the bilinear mode draw through a canvas.
 */
export function resizeWindow(src: Source, rW: number, rH: number, x: number, y: number, w: number, h: number,
  ds: Downscale, cache?: ResizeCache): Uint8ClampedArray {
  const { width: sw, height: sh } = src;
  const exact = (ds.mode === "dpid" || ds.mode === "stbir") && rW <= sw && rH <= sh;
  const compute = (x: number, y: number, w: number, h: number) => {
    if (exact) {
      return ds.mode === "stbir" ? stbirWindow(src.pixels, sw, sh, rW, rH, x, y, w, h)
        : dpidWindow(src.pixels, sw, sh, rW, rH, x, y, w, h, ds.lambda);
    }
    if (!src.drawable) throw new Error("bilinear/upscale resize needs a drawable source");
    const c = new OffscreenCanvas(w, h), g = c.getContext("2d")!;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(src.drawable, -x, -y, rW, rH);
    return g.getImageData(0, 0, w, h).data;
  };
  if (!cache) return compute(x, y, w, h);
  const key = `${rW}x${rH}|${exact ? ds.mode : "canvas"}|${ds.mode === "dpid" ? ds.lambda : ""}`;
  return cache.window(key, rW, rH, x, y, w, h, compute);
}

/** Where the frame sits in the resized image, plus the rotation flags placeCrop needs. */
export interface Layout { rW: number; rH: number; ox: number; oy: number; landscape: boolean; srcLandscape: boolean }

/** The binary's centred crop offsets in an rW×rH resize, as a top-left in R's own coordinates. */
function autoOffsets(rW: number, rH: number, cropW: number, cropH: number) {
  let b4 = rW - cropW; if (b4 < 0) b4++; let yy = rH - cropH; if (yy < 0) yy++;
  if (rH < rW) { b4 = rW - cropH; if (b4 < 0) b4++; yy = rH - cropW; if (yy < 0) yy++; }
  b4 = b4 >> 1; const b8 = yy >> 1;
  const landscape = rH < rW;
  // the binary offsets a landscape read from the bottom row; convert to a top offset
  return { ox: b4, oy: landscape ? rH - cropW - b8 : b8, landscape };
}

/** The exact auto crop's layout: calc_wh cover-resize, centred. */
export function autoLayout(sw: number, sh: number, OW: number, OH: number, chip: number): Layout {
  const { cropW, cropH } = cropSize(OW, OH, chip);
  const { rW, rH } = resizeTarget(sw, sh, cropW, cropH);
  return { rW, rH, ...autoOffsets(rW, rH, cropW, cropH), srcLandscape: sh < sw };
}

/** A manual framing's layout: same frame orientation as the auto crop, the user's scale and offset. */
export function manualLayout(sw: number, sh: number, OW: number, OH: number, chip: number,
  t: { scale: number; tx: number; ty: number }): Layout {
  const a = autoLayout(sw, sh, OW, OH, chip);
  const { fw, fh } = frameSize(OW, OH, chip, a.landscape);
  const rW = Math.max(Math.round(sw * t.scale), fw), rH = Math.max(Math.round(sh * t.scale), fh);
  const ox = Math.min(Math.max(Math.round(-t.tx), 0), rW - fw), oy = Math.min(Math.max(Math.round(-t.ty), 0), rH - fh);
  return { rW, rH, ox, oy, landscape: a.landscape, srcLandscape: a.srcLandscape };
}

/** The framing that reproduces a layout (used to show the auto crop in the cropper). */
export const layoutTransform = (L: Layout, sw: number) => ({ scale: L.rW / sw, tx: -L.ox, ty: -L.oy });

/**
 * The crop frame in the resized image: landscape layouts read a cropH×cropW frame that placeCrop
 * rotates into the slot.
 */
export function frameSize(OW: number, OH: number, chip: number, landscape: boolean) {
  const { cropW, cropH } = cropSize(OW, OH, chip);
  return landscape ? { fw: cropH, fh: cropW } : { fw: cropW, fh: cropH };
}

/**
 * Rotate/flip the frame at (ox,oy) of the resized image R (rW×rH) into the crop and paste it into the
 * white OW×OH page at the model-specific offsets. `landscape` selects the rotated read (frame is
 * cropH wide × cropW tall in R).
 */
export function placeCrop(R: Uint8ClampedArray, rW: number, ox: number, oy: number, landscape: boolean,
  srcLandscape: boolean, OW: number, OH: number, chip: number): Uint8ClampedArray {
  const { cropW, cropH } = cropSize(OW, OH, chip);
  const square = cropW === cropH;
  const crop = new Uint8ClampedArray(cropW * cropH * 4);
  for (let r = 0; r < cropH; r++) for (let c = 0; c < cropW; c++) {
    let dp: number;
    if (landscape) {
      if (square && (chip === 1 || chip === 2)) dp = srcLandscape ? ((cropW - r) + c * cropH) - 1 : (r * cropW + c);
      else dp = (srcLandscape && square) ? ((cropW - 1 - c) * cropH + r) : (r * cropW + c);
    } else {
      if (square && (chip === 1 || chip === 2)) dp = ((cropW - c) + ((cropH - 1 - r) * cropW)) - 1;
      else dp = r * cropW + c;
    }
    const sp = landscape ? ((oy + cropW - 1 - c) * rW + (ox + r)) : ((oy + r) * rW + (ox + c));
    const di = dp * 4, si = sp * 4;
    crop[di] = R[si]; crop[di + 1] = R[si + 1]; crop[di + 2] = R[si + 2]; crop[di + 3] = 255;
  }
  if (OH === 1024) {
    const n = cropW * cropH;
    for (let i = 0; i < (n >> 1); i++) {
      const a = i * 4, b = (n - 1 - i) * 4;
      for (let k = 0; k < 3; k++) { const t = crop[a + k]; crop[a + k] = crop[b + k]; crop[b + k] = t; }
    }
  }
  if (cropW === OW && cropH === OH) return crop;
  let fc = OW - cropW; if (fc < 0) fc++; fc = fc >> 1; let fy = OH - cropH; if (fy < 0) fy++; fy = fy >> 1;
  if (chip === 1) {
    if (OH === 1024) { fc = OW - cropW; if (fc < 0) fc++; fc = fc >> 1; fy = 0; }
    else if (OH === 896) {
      let t = OW - cropW; if (t < 0) t++; fc = (t >> 1) - 5;
      let t2 = OW - cropW; if (t2 < 0) t2++; fy = ((t2 >> 1) - 4.5) | 0;
    }
    else if (OH === 1864) { fc = OW - cropW; if (fc < 0) fc++; fc = fc >> 1; fy = 12; }
  }
  if (fc < 0) fc = 0; if (fy < 0) fy = 0;
  const out = new Uint8ClampedArray(OW * OH * 4).fill(255);
  for (let r = 0; r < cropH; r++) for (let c = 0; c < cropW; c++) {
    const op = ((fy + r) * OW + fc + c) * 4, ip = (r * cropW + c) * 4;
    out[op] = crop[ip]; out[op + 1] = crop[ip + 1]; out[op + 2] = crop[ip + 2]; out[op + 3] = 255;
  }
  return out;
}

/** The exact auto crop from a full cover-resized image R (rW×rH). */
export function cropFromResized(R: Uint8ClampedArray, rW: number, rH: number, srcLandscape: boolean,
  OW: number, OH: number, chip: number): Uint8ClampedArray {
  const { cropW, cropH } = cropSize(OW, OH, chip);
  const { ox, oy, landscape } = autoOffsets(rW, rH, cropW, cropH);
  return placeCrop(R, rW, ox, oy, landscape, srcLandscape, OW, OH, chip);
}

/** Resize just the frame's window of the layout and place it on the page. */
export function cropAt(src: Source, L: Layout, OW: number, OH: number, chip: number, ds: Downscale, cache?: ResizeCache) {
  const { fw, fh } = frameSize(OW, OH, chip, L.landscape);
  const win = resizeWindow(src, L.rW, L.rH, L.ox, L.oy, fw, fh, ds, cache);
  return placeCrop(win, fw, 0, 0, L.landscape, L.srcLandscape, OW, OH, chip);
}

export const resizeAndCropExact = (src: Source, OW: number, OH: number, chip: number, ds: Downscale, cache?: ResizeCache) =>
  cropAt(src, autoLayout(src.width, src.height, OW, OH, chip), OW, OH, chip, ds, cache);

export const manualCrop = (src: Source, OW: number, OH: number, chip: number, ds: Downscale,
  t: { scale: number; tx: number; ty: number }, cache?: ResizeCache) =>
  cropAt(src, manualLayout(src.width, src.height, OW, OH, chip, t), OW, OH, chip, ds, cache);

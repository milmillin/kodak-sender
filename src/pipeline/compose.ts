// Manual crop framing: the photo's placement under a fixed frame (see frameSize in resizeCrop.ts).

/** Source pixel p maps to frame pixel p·scale + t. */
export interface Transform { scale: number; tx: number; ty: number }

/** Furthest zoom-in, relative to the cover scale. */
export const MAX_ZOOM = 10;

/** Default framing: cover the frame, centred — matches the auto crop. */
export function coverTransform(sw: number, sh: number, fw: number, fh: number): Transform {
  const scale = Math.max(fw / sw, fh / sh);
  return { scale, tx: (fw - sw * scale) / 2, ty: (fh - sh * scale) / 2 };
}

/** Keep the photo covering the whole frame (no blank edges) and the zoom in range. */
export function clampTransform(t: Transform, sw: number, sh: number, fw: number, fh: number): Transform {
  const min = Math.max(fw / sw, fh / sh);
  const scale = Math.min(Math.max(t.scale, min), min * MAX_ZOOM);
  const clamp = (v: number, lo: number) => Math.min(0, Math.max(lo, v));
  return { scale, tx: clamp(t.tx, fw - sw * scale), ty: clamp(t.ty, fh - sh * scale) };
}

export interface Snapped { t: Transform; x: boolean; y: boolean }

/**
 * Snap the photo's centre onto the frame's centre lines and the zoom onto "fill", when within
 * `tol` frame pixels (zoom: the same tolerance at the frame edge).
 */
export function snapTransform(t: Transform, sw: number, sh: number, fw: number, fh: number, tol: number): Snapped {
  let { scale, tx, ty } = t;
  const cover = Math.max(fw / sw, fh / sh);
  if (scale !== cover && Math.abs(scale - cover) * Math.max(sw, sh) < tol) {
    // zoom about the frame centre
    const k = cover / scale, cx = fw / 2, cy = fh / 2;
    tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; scale = cover;
  }
  const dx = fw / 2 - (tx + (sw * scale) / 2), dy = fh / 2 - (ty + (sh * scale) / 2);
  const x = Math.abs(dx) < tol, y = Math.abs(dy) < tol;
  if (x) tx += dx;
  if (y) ty += dy;
  return { t: clampTransform({ scale, tx, ty }, sw, sh, fw, fh), x, y };
}

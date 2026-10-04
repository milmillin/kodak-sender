// Caches resized regions of the source, so pans and non-resize setting changes skip the resize.
// Windows are exact (see dpidWindow), so a slice of a cached region equals a fresh computation.

interface Entry { key: string; x: number; y: number; w: number; h: number; px: Uint8ClampedArray }

const MAX_ENTRIES = 2;

export class ResizeCache {
  private entries: Entry[] = [];
  hits = 0;
  misses = 0;

  /** The window (x,y,w,h) of the resized image identified by `key`, computing a padded region on a miss. */
  window(key: string, rW: number, rH: number, x: number, y: number, w: number, h: number,
    compute: (x: number, y: number, w: number, h: number) => Uint8ClampedArray): Uint8ClampedArray {
    let e = this.entries.find((e) => e.key === key && x >= e.x && y >= e.y && x + w <= e.x + e.w && y + h <= e.y + e.h);
    if (e) {
      this.hits++;
      this.entries = [e, ...this.entries.filter((o) => o !== e)];
    } else {
      this.misses++;
      // pad by half a window each side so nearby pans hit
      const x0 = Math.max(0, x - (w >> 1)), y0 = Math.max(0, y - (h >> 1));
      const x1 = Math.min(rW, x + w + (w >> 1)), y1 = Math.min(rH, y + h + (h >> 1));
      e = { key, x: x0, y: y0, w: x1 - x0, h: y1 - y0, px: compute(x0, y0, x1 - x0, y1 - y0) };
      this.entries = [e, ...this.entries].slice(0, MAX_ENTRIES);
    }
    if (e.x === x && e.y === y && e.w === w && e.h === h) return e.px.slice();
    const out = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) {
      const s = ((y - e.y + r) * e.w + (x - e.x)) * 4;
      out.set(e.px.subarray(s, s + w * 4), r * w * 4);
    }
    return out;
  }

  clear() { this.entries = []; }
}

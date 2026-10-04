import { useCallback, useEffect, useRef } from "react";
import { clampTransform, snapTransform, type Transform } from "../pipeline/compose";
import type { SourceInfo } from "../hooks/usePipeline";
import { useCanvasSize, useGestures } from "../hooks/useGestures";

interface Props {
  source: SourceInfo;
  /** Crop frame size in output pixels, in the photo's orientation. */
  fw: number;
  fh: number;
  transform: Transform;
  onGestureStart: () => void;
  onChange: (t: Transform) => void;
  onReset: () => void;
}

const BG = "#111317";
const SNAP_CSS_PX = 10;

/** Fixed crop frame over the photo: drag / pinch / wheel to position, snaps to centre and fill. */
export function ComposeView({ source, fw, fh, transform, onGestureStart, onChange, onReset }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const t = useRef(transform);
  t.current = transform;
  const disp = useRef({ s: 1, x0: 0, y0: 0 });
  // unsnapped transform while a gesture is active, so snapping never sticks
  const raw = useRef<Transform | null>(null);
  const guides = useRef({ x: false, y: false });
  const { width: sw, height: sh } = source;

  const draw = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d")!, W = cv.width, H = cv.height, dpr = window.devicePixelRatio || 1;
    const s = Math.min((W - 32 * dpr) / fw, (H - 32 * dpr) / fh);
    const x0 = (W - fw * s) / 2, y0 = (H - fh * s) / 2, c = t.current;
    disp.current = { s, x0, y0 };

    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(source.display, x0 + c.tx * s, y0 + c.ty * s, sw * c.scale * s, sh * c.scale * s);

    // dim everything outside the frame
    g.beginPath(); g.rect(0, 0, W, H); g.rect(x0, y0, fw * s, fh * s);
    g.fillStyle = "rgba(17,19,23,.74)"; g.fill("evenodd");

    const line = (ax: number, ay: number, bx: number, by: number) => { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); };
    if (raw.current) { // rule-of-thirds while adjusting
      g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = dpr;
      for (const k of [1 / 3, 2 / 3]) {
        line(x0 + fw * s * k, y0, x0 + fw * s * k, y0 + fh * s);
        line(x0, y0 + fh * s * k, x0 + fw * s, y0 + fh * s * k);
      }
      g.strokeStyle = "#e6694f"; g.lineWidth = 1.5 * dpr;
      if (guides.current.x) line(x0 + fw * s / 2, y0, x0 + fw * s / 2, y0 + fh * s);
      if (guides.current.y) line(x0, y0 + fh * s / 2, x0 + fw * s, y0 + fh * s / 2);
    }
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 1.5 * dpr;
    g.strokeRect(x0, y0, fw * s, fh * s);
  }, [source, sw, sh, fw, fh]);

  useCanvasSize(ref, draw);
  useEffect(draw, [draw, transform]);

  const apply = (next: Transform) => {
    raw.current = clampTransform(next, sw, sh, fw, fh);
    const tol = (SNAP_CSS_PX * (window.devicePixelRatio || 1)) / disp.current.s;
    const snapped = snapTransform(raw.current, sw, sh, fw, fh, tol);
    guides.current = { x: snapped.x, y: snapped.y };
    onChange(snapped.t);
  };

  useGestures(ref, {
    onStart: () => { raw.current = t.current; onGestureStart(); },
    onPan: (x, y) => {
      const r = raw.current ?? t.current, { s } = disp.current;
      apply({ ...r, tx: r.tx + x / s, ty: r.ty + y / s });
    },
    onZoom: (k, px, py) => {
      const r = raw.current ?? t.current, { s, x0, y0 } = disp.current;
      const fx = (px - x0) / s, fy = (py - y0) / s;
      const scale = clampTransform({ ...r, scale: r.scale * k }, sw, sh, fw, fh).scale, kk = scale / r.scale;
      apply({ scale, tx: fx - (fx - r.tx) * kk, ty: fy - (fy - r.ty) * kk });
    },
    onEnd: () => { raw.current = null; guides.current = { x: false, y: false }; draw(); },
    onDoubleTap: onReset,
  });

  return <canvas ref={ref} className="stage-canvas" aria-label="Crop. Drag to move, pinch or scroll to zoom, double-tap to reset." />;
}

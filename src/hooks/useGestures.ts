import { useEffect, useRef } from "react";

export interface GestureHandlers {
  /** Pan by (dx,dy) canvas device pixels. */
  onPan?: (dx: number, dy: number) => void;
  /** Zoom by factor k about (px,py) in canvas device pixels. */
  onZoom?: (k: number, px: number, py: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onDoubleTap?: () => void;
}

/** Mouse drag, wheel zoom, one-finger pan, two-finger pinch, and double-tap on a canvas. */
export function useGestures(ref: React.RefObject<HTMLCanvasElement | null>, handlers: GestureHandlers, enabled = true) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !enabled) return;
    const pts = new Map<number, { x: number; y: number }>();
    let lastTap = 0;
    const toCanvas = (cx: number, cy: number) => {
      const r = cv.getBoundingClientRect();
      return { x: (cx - r.left) * (cv.width / r.width), y: (cy - r.top) * (cv.height / r.height) };
    };
    const pair = () => {
      const [a, b] = [...pts.values()];
      return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, toCanvas(e.clientX, e.clientY));
      if (pts.size === 1) {
        h.current.onStart?.();
        const now = performance.now();
        if (now - lastTap < 300) { h.current.onDoubleTap?.(); lastTap = 0; } else lastTap = now;
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      if (pts.size === 1) {
        const p = toCanvas(e.clientX, e.clientY);
        pts.set(e.pointerId, p);
        h.current.onPan?.(p.x - prev.x, p.y - prev.y);
      } else if (pts.size === 2) {
        const before = pair();
        pts.set(e.pointerId, toCanvas(e.clientX, e.clientY));
        const after = pair();
        if (before.dist > 0) h.current.onZoom?.(after.dist / before.dist, before.mid.x, before.mid.y);
        h.current.onPan?.(after.mid.x - before.mid.x, after.mid.y - before.mid.y);
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size === 0) h.current.onEnd?.();
    };
    let wheelEnd: ReturnType<typeof setTimeout> | undefined;
    let wheeling = false;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!wheeling) { wheeling = true; h.current.onStart?.(); }
      const p = toCanvas(e.clientX, e.clientY);
      // trackpad pinch arrives as ctrl+wheel with small deltas
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      h.current.onZoom?.(k, p.x, p.y);
      clearTimeout(wheelEnd);
      wheelEnd = setTimeout(() => { wheeling = false; h.current.onEnd?.(); }, 200);
    };

    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => {
      clearTimeout(wheelEnd);
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("wheel", wheel);
    };
  }, [ref, enabled]);
}

/** Keep a canvas's backing store at its CSS size × devicePixelRatio; returns a redraw tick. */
export function useCanvasSize(ref: React.RefObject<HTMLCanvasElement | null>, onResize: () => void) {
  const cb = useRef(onResize);
  cb.current = onResize;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const r = cv.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
      cb.current();
    });
    ro.observe(cv);
    return () => ro.disconnect();
  }, [ref]);
}

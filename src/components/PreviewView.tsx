import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCanvasSize, useGestures } from "../hooks/useGestures";
import type { PipelineOutput } from "../hooks/usePipeline";

const BG = "#111317";

/** The exact pixels sent to the printer, shown without smoothing. Pan / pinch / wheel to inspect. */
export function PreviewView({ output, upright }: { output: PipelineOutput; upright: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef<{ zoom: number; ox: number; oy: number } | null>(null);
  const { width: W, height: H } = output;
  // the 640×1024 profile is stored upside-down; the printer flips it back
  const flip = upright && H === 1024;

  const bitmap = useMemo(() => {
    const c = new OffscreenCanvas(W, H);
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(output.pixels), W, H), 0, 0);
    return c;
  }, [output, W, H]);

  const fit = useCallback(() => {
    const cv = ref.current; if (!cv) return;
    const zoom = Math.min(cv.width / W, cv.height / H) * 0.95;
    view.current = { zoom, ox: (cv.width - W * zoom) / 2, oy: (cv.height - H * zoom) / 2 };
  }, [W, H]);

  const draw = useCallback(() => {
    const cv = ref.current; if (!cv) return;
    if (!view.current) fit();
    const g = cv.getContext("2d")!, v = view.current!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = BG; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = false;
    if (flip) {
      g.translate(v.ox + W * v.zoom, v.oy + H * v.zoom); g.rotate(Math.PI);
      g.drawImage(bitmap, 0, 0, W * v.zoom, H * v.zoom);
    } else {
      g.drawImage(bitmap, v.ox, v.oy, W * v.zoom, H * v.zoom);
    }
  }, [bitmap, W, H, flip, fit]);

  // refit when the output size changes (e.g. a different printer model)
  useEffect(() => { view.current = null; }, [W, H]);
  useCanvasSize(ref, () => { view.current = null; draw(); });
  useEffect(draw, [draw]);

  useGestures(ref, {
    onPan: (x, y) => { const v = view.current; if (!v) return; v.ox += x; v.oy += y; draw(); },
    onZoom: (k, px, py) => {
      const v = view.current; if (!v) return;
      const ix = (px - v.ox) / v.zoom, iy = (py - v.oy) / v.zoom;
      v.zoom = Math.min(Math.max(v.zoom * k, 0.05), 64);
      v.ox = px - ix * v.zoom; v.oy = py - iy * v.zoom; draw();
    },
    onDoubleTap: () => { view.current = null; draw(); },
  });

  return <canvas ref={ref} className="stage-canvas pixelated" aria-label="Print preview. Drag to pan, pinch or scroll to zoom, double-tap to fit." />;
}

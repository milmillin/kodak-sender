import { useEffect, useRef, useState } from "react";
import type { PipelineJob } from "../pipeline/run";
import type { FromWorker, ToWorker } from "../worker/messages";

export interface SourceInfo {
  /** Dimensions of the source the worker processes (transforms are in these pixels). */
  width: number;
  height: number;
  /** Reduced-size bitmap for on-screen framing. */
  display: ImageBitmap;
  name: string;
}

export interface PipelineOutput {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  bytes: Uint8Array;
  quality: number;
  ms: number;
}

const DISPLAY_MAX = 2048;
const DEBOUNCE_MS = 200;

/** Decodes `file`, then re-runs the print pipeline (in a worker) whenever `job` changes. */
export function usePipeline(file: File | null, job: PipelineJob | null) {
  const workerRef = useRef<Worker | null>(null);
  const ids = useRef({ source: 0, run: 0 });
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [output, setOutput] = useState<PipelineOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const w = new Worker(new URL("../worker/pipeline.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    return () => { w.terminate(); workerRef.current = null; };
  }, []);

  // decode source
  useEffect(() => {
    const w = workerRef.current;
    if (!file || !w) return;
    const id = ++ids.current.source;
    let cancelled = false;
    setError(null); setOutput(null); setBusy(true);

    const onMsg = async (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if ((m.type !== "source-ready" && m.type !== "source-error") || m.id !== id) return;
      w.removeEventListener("message", onMsg);
      if (cancelled) return;
      if (m.type === "source-error") { setBusy(false); setError(`Couldn't open this image (${m.message}).`); return; }
      try {
        const k = Math.min(1, DISPLAY_MAX / Math.max(m.width, m.height));
        const display = await createImageBitmap(file, {
          imageOrientation: "from-image", resizeQuality: "high",
          resizeWidth: Math.max(1, Math.round(m.width * k)), resizeHeight: Math.max(1, Math.round(m.height * k)),
        });
        if (cancelled) { display.close(); return; }
        setSource((prev) => { prev?.display.close(); return { width: m.width, height: m.height, display, name: file.name }; });
      } catch (err) {
        setBusy(false); setError(`Couldn't open this image (${(err as Error).message}).`);
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "source", id, blob: file } satisfies ToWorker);
    return () => { cancelled = true; w.removeEventListener("message", onMsg); };
  }, [file]);

  // run pipeline (debounced)
  const jobKey = job ? JSON.stringify(job) : "";
  useEffect(() => {
    const w = workerRef.current;
    if (!w || !job || !source) return;
    setBusy(true);
    const id = ++ids.current.run;
    const sourceId = ids.current.source;
    const onMsg = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if ((m.type !== "result" && m.type !== "error") || m.id !== id) return;
      if (m.type === "error") { setError(`Processing failed: ${m.message}`); setBusy(false); return; }
      setError(null);
      setOutput({ width: m.width, height: m.height, pixels: m.pixels, bytes: m.bytes, quality: m.quality, ms: m.ms });
      setBusy(false);
    };
    w.addEventListener("message", onMsg);
    const t = setTimeout(() => w.postMessage({ type: "run", id, sourceId, job } satisfies ToWorker), DEBOUNCE_MS);
    return () => { clearTimeout(t); w.removeEventListener("message", onMsg); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobKey, source]);

  return { source, output, busy, error };
}

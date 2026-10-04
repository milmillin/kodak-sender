/// <reference lib="webworker" />
// Runs the image pipeline off the main thread. Only the newest queued job is processed.
import { runPipeline } from "../pipeline/run";
import type { Source } from "../pipeline/resizeCrop";
import { ResizeCache } from "../pipeline/resizeCache";
import type { FromWorker, ToWorker } from "./messages";

declare const self: DedicatedWorkerGlobalScope;

/** Guard against phone photos large enough to exhaust worker memory. */
const MAX_SOURCE_SIDE = 6000;

let source: Source | null = null;
/** Resized regions of the current source; reused across pans and setting changes. */
const cache = new ResizeCache();
let sourceId = -1;
let pending: Extract<ToWorker, { type: "run" }> | null = null;
let running = false;

const post = (m: FromWorker, transfer: Transferable[] = []) => self.postMessage(m, transfer);

async function loadSource(id: number, blob: Blob) {
  const probe = await createImageBitmap(blob, { imageOrientation: "from-image" });
  let bmp = probe;
  const long = Math.max(probe.width, probe.height);
  if (long > MAX_SOURCE_SIDE) {
    const k = MAX_SOURCE_SIDE / long;
    bmp = await createImageBitmap(blob, {
      imageOrientation: "from-image", resizeQuality: "high",
      resizeWidth: Math.round(probe.width * k), resizeHeight: Math.round(probe.height * k),
    });
    probe.close();
  }
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  source?.drawable instanceof ImageBitmap && source.drawable.close();
  cache.clear();
  source = { width: bmp.width, height: bmp.height, pixels: g.getImageData(0, 0, bmp.width, bmp.height).data, drawable: bmp };
  sourceId = id;
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending) {
      const msg = pending; pending = null;
      if (msg.sourceId > sourceId) { pending ??= msg; break; } // source still loading; retried on source-ready
      if (!source || msg.sourceId !== sourceId) continue;
      const t0 = performance.now();
      try {
        const r = await runPipeline(source, msg.job, cache);
        if (pending) continue; // superseded while encoding
        post({ type: "result", id: msg.id, width: r.width, height: r.height, pixels: r.pixels, bytes: r.bytes, quality: r.quality, ms: performance.now() - t0 },
          [r.pixels.buffer, r.bytes.buffer]);
      } catch (e) {
        post({ type: "error", id: msg.id, message: (e as Error).message });
      }
    }
  } finally { running = false; }
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === "source") {
    try {
      await loadSource(m.id, m.blob);
      post({ type: "source-ready", id: m.id, width: source!.width, height: source!.height });
      drain();
    } catch (err) {
      post({ type: "source-error", id: m.id, message: (err as Error).message || "Could not decode image" });
    }
  } else {
    pending = m;
    drain();
  }
};

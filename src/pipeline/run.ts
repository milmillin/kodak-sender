// The full print pipeline — mirrors rebuild() in send.html.
import { borderEdges, MODELS } from "./models";
import { manualCrop, resizeAndCropExact, type Source } from "./resizeCrop";
import type { Transform } from "./compose";
import type { ResizeCache } from "./resizeCache";
import { sharpen } from "./sharpen";
import { colorLUT, toneLUT } from "./color";
import { thcSAC } from "./thc";
import { encodeJpeg } from "./jpeg";
import type { PipelineSettings } from "./settings";

export interface PipelineJob {
  profileIdx: number;
  chip: number;
  settings: PipelineSettings;
  /** Manual crop framing; null = the exact auto crop. */
  transform: Transform | null;
}

export interface PipelineResult {
  width: number;
  height: number;
  /** Exactly the pixels encoded for the printer. */
  pixels: Uint8ClampedArray;
  bytes: Uint8Array;
  quality: number;
}

/** Runs every pixel stage, without JPEG. Exported separately so it can be tested without a canvas. */
export function processPixels(src: Source, job: PipelineJob, cache?: ResizeCache): Uint8ClampedArray {
  const m = MODELS[job.profileIdx], OW = m.rw, OH = m.rh, ch = job.chip, st = job.settings.stages;
  const s = job.settings, ds = { mode: s.dsMode, lambda: s.dsLambda };
  const d = job.transform ? manualCrop(src, OW, OH, ch, ds, job.transform, cache) : resizeAndCropExact(src, OW, OH, ch, ds, cache);
  if (st.sharpen) sharpen(d, OW, OH, s.hp, s.usm);
  if (st.border) {
    const e = borderEdges(OW, OH, ch);
    const fill = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = Math.max(0, y0); y < Math.min(OH, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(OW, x1); x++) {
          const i = (y * OW + x) * 4; d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
        }
    };
    fill(0, 0, OW, e.T); fill(0, e.B, OW, OH); fill(0, 0, e.L, OH); fill(e.R, 0, OW, OH);
  }
  if (ch !== 0) {
    if (st.lut3d) colorLUT(d);
    if (st.lut1d) toneLUT(d, m.family, ch);
    if (st.thc) thcSAC(d, OW, OH);
  }
  return d;
}

export async function runPipeline(src: Source, job: PipelineJob, cache?: ResizeCache): Promise<PipelineResult> {
  const m = MODELS[job.profileIdx], OW = m.rw, OH = m.rh;
  const pixels = processPixels(src, job, cache);
  const c = new OffscreenCanvas(OW, OH);
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels), OW, OH), 0, 0);
  const { bytes, quality } = await encodeJpeg(c, job.settings.quality);
  return { width: OW, height: OH, pixels, bytes, quality };
}

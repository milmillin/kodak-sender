import type { PipelineJob } from "../pipeline/run";

export type ToWorker =
  | { type: "source"; id: number; blob: Blob }
  | { type: "run"; id: number; sourceId: number; job: PipelineJob };

export type FromWorker =
  | { type: "source-ready"; id: number; width: number; height: number }
  | { type: "source-error"; id: number; message: string }
  | { type: "result"; id: number; width: number; height: number; pixels: Uint8ClampedArray; bytes: Uint8Array; quality: number; ms: number }
  | { type: "error"; id: number; message: string };

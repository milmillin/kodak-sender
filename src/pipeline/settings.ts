import type { DownscaleMode } from "./resizeCrop";

export type StageId = "sharpen" | "border" | "lut3d" | "lut1d" | "thc" | "jpeg";

export interface StageDef {
  id: StageId;
  name: string;
  desc: string;
  lock?: boolean;
}

/** Optional pipeline stages, in process_image order (resize & crop and the safety shrink always run). */
export const STAGES: StageDef[] = [
  { id: "sharpen", name: "Sharpen", desc: "highpass5 + bilateral USM" },
  { id: "border", name: "White border", desc: "add_border insets" },
  { id: "lut3d", name: "3D color LUT", desc: "33³ table" },
  { id: "lut1d", name: "1D tone curve", desc: "C/M/Y table" },
  { id: "thc", name: "Thermal-head comp", desc: "smear-adaptive" },
  { id: "jpeg", name: "JPEG encode", desc: "≤ 1 MB, steps quality down by 5", lock: true },
];

export interface PipelineSettings {
  stages: Record<StageId, boolean>;
  /** high-pass blend and USM strength, 0..1.5 */
  hp: number;
  usm: number;
  quality: number;
  dsMode: DownscaleMode;
  dsLambda: number;
}

export const DEFAULT_SETTINGS: PipelineSettings = {
  stages: { sharpen: true, border: false, lut3d: true, lut1d: true, thc: true, jpeg: true },
  hp: 0.6,
  usm: 0.5,
  quality: 90,
  dsMode: "stbir",
  dsLambda: 1.0,
};

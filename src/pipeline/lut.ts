// Real LUT tables, extracted from .rodata of libprinics_ip.so (see scripts/extract-lut.mjs).
import lut from "./lut.json";

function b64bytes(s: string) {
  const bin = atob(s); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

/** 256 bilateral range weights (×16384). */
export const RANGE = Int32Array.from(lut.rangeSmooth);
/** 33³ RGB grid, R innermost, stride G=33, B=1089. */
export const LUT3D = b64bytes(lut.lut3d);
/** 256×3 interleaved C,M,Y tone tables, keyed by chip/family. */
export const LUT1D: Record<string, Uint8Array> = Object.fromEntries(
  Object.entries(lut.lut1d as Record<string, string>).map(([k, v]) => [k, b64bytes(v)]),
);

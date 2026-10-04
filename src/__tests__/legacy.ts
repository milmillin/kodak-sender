// Loads the original pure functions out of reference/send.html so the TS port can be checked against them.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const html = readFileSync(fileURLToPath(new URL("../../reference/send.html", import.meta.url)), "utf8");

function between(s: string, start: string, end: string) {
  const i = s.indexOf(start);
  const j = s.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error(`send.html: section ${start} … ${end} not found`);
  return s.slice(i, j + end.length);
}

const lutJson = html.match(/window\.__LUT=(\{.*?\});<\/script>/s)![1];
const script = html.slice(html.indexOf('"use strict";'));
// everything from the constants up to the DOM wiring is pure
const pure = script.slice(0, script.indexOf("const $=s=>document.querySelector(s);"));
const decode = between(script, "function decodeStatus(", "cartridge:g(14) }; }");
const start = between(script, "function startPacket(", "return p; }");

/** Pixels the fake canvas hands to resizeAndCropExact's getImageData. */
let fakeSource: Uint8ClampedArray = new Uint8ClampedArray(0);

const context = vm.createContext({
  atob, Math, Uint8Array, Uint8ClampedArray, Int32Array, Float32Array, Array, Object,
  window: { __LUT: JSON.parse(lutJson) },
  ImageData: class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} },
  document: {
    createElement: () => ({
      getContext: () => ({ drawImage() {}, getImageData: () => ({ data: fakeSource }) }),
    }),
  },
});

type Fn = (...a: any[]) => any;
export const legacy = vm.runInContext(
  `${pure}\n${decode}\n${start}\n({ DS, dpidDownscale, stbirResize, resizeAndCropExact, sharpen, colorLUT, toneLUT, thcSAC, borderEdges, decodeStatus, startPacket })`,
  context,
) as Record<string, Fn> & { DS: { mode: string; lambda: number } };

export function setLegacySource(px: Uint8ClampedArray) { fakeSource = px; }

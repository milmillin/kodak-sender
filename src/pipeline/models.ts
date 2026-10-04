// Printer model table (rw×rh, family) — from Java_com_prinics_ip_Prepare_prepare.
export interface Model {
  id: string;
  name: string;
  rw: number;
  rh: number;
  family: number;
}

export const MODELS: Model[] = [
  { id: "m2", name: "D662 / 2-inch — 640×1024", rw: 640, rh: 1024, family: 2 },
  { id: "m3", name: "3-inch square — 896×896", rw: 896, rh: 896, family: 3 },
  { id: "def", name: "Mini / default — 1240×1864", rw: 1240, rh: 1864, family: 4 },
  { id: "m6", name: "4-inch — 1280×1280", rw: 1280, rh: 1280, family: 6 },
];

/** Decoded printer model number (e.g. 102) → index into MODELS. */
export function profileFor(n: number): number {
  const d = n % 10;
  return d === 2 ? 0 : d === 3 ? 1 : d === 6 ? 3 : 2;
}

export interface Edges { L: number; T: number; R: number; B: number }

/** White-border insets, exact from add_border(w,h,chip). */
export function borderEdges(w: number, h: number, chip: number): Edges {
  let L: number, T: number, R: number, B: number;
  if (chip === 0) {
    if (h < 0x381) { L = 0x46; T = 0x37; R = w - 0x32; B = h - 0x46; }
    else if (h < 0x401) { L = 0x37; T = 0x37; R = w - 0x32; B = h - 0x32; }
    else if (h < 0x501) { L = 100; T = 0x7d; R = w - 0x82; B = h - 0x69; }
    else { L = 0x6e; T = 0x6e; R = w - 0x5f; B = h - 0x4b; }
  } else {
    if (h < 0x381) { L = 0x32; T = 0x32; R = w - 0x3c; B = h - 0x37; }
    else if (h < 0x401) { L = 0x37; T = 0x32; R = w - 0x37; B = h - 0x37; }
    else if (h < 0x501) { L = 100; T = 0x6e; R = w - 100; B = h - 0x78; }
    else { L = 0x69; T = 0x6e; R = w - 0x69; B = h - 0x78; }
  }
  return { L, T, R, B };
}

export const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

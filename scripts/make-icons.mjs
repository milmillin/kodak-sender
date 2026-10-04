// Generates the PWA icons (an instant-print card) as PNGs, plus the SVG favicon. No dependencies.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../public/", import.meta.url));
const BG = [0x13, 0x15, 0x19], CARD = [0xf4, 0xf1, 0xea], A = [0xe6, 0x69, 0x4f], B = [0xd9, 0x9a, 0x4e];

// shapes in a 0..1 unit square
const roundRect = (x, y, x0, y0, x1, y1, r) => {
  const qx = Math.max(x0 + r - x, 0, x - (x1 - r)), qy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return Math.hypot(qx, qy) - r; // ≤0 inside
};

function shade(x, y, { pad, rounded }) {
  // map into the safe zone
  const u = (x - pad) / (1 - 2 * pad), v = (y - pad) / (1 - 2 * pad);
  const card = roundRect(u, v, 0.2, 0.1, 0.8, 0.9, 0.05);
  const photo = roundRect(u, v, 0.26, 0.16, 0.74, 0.68, 0.015);
  let c = BG, bgA = rounded ? (roundRect(x, y, 0, 0, 1, 1, 0.22) <= 0 ? 1 : 0) : 1;
  if (card <= 0) c = CARD;
  if (photo <= 0) {
    const t = Math.min(1, Math.max(0, (u - 0.26 + v - 0.16) / 1.0));
    c = A.map((a, i) => a + (B[i] - a) * t);
    // sun
    if (Math.hypot(u - 0.6, v - 0.32) < 0.06) c = [0xfb, 0xe3, 0xb0];
    // hills
    if (v > 0.52 - 0.08 * Math.sin((u - 0.26) * 9)) c = c.map((k) => k * 0.62);
  }
  return [...c, bgA * 255];
}

function png(size, opts) {
  const ss = 4, raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
        const p = shade((x + (i + 0.5) / ss) / size, (y + (j + 0.5) / ss) / size, opts);
        for (let k = 0; k < 4; k++) acc[k] += p[k];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let k = 0; k < 4; k++) raw[o + k] = Math.round(acc[k] / (ss * ss));
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync(out + "icon-192.png", png(192, { pad: 0, rounded: true }));
writeFileSync(out + "icon-512.png", png(512, { pad: 0, rounded: true }));
writeFileSync(out + "icon-maskable-512.png", png(512, { pad: 0.1, rounded: false }));
writeFileSync(out + "apple-touch-icon.png", png(180, { pad: 0.04, rounded: false }));
writeFileSync(out + "icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6694f"/><stop offset="1" stop-color="#d99a4e"/></linearGradient></defs>
<rect width="100" height="100" rx="22" fill="#131519"/>
<rect x="20" y="10" width="60" height="80" rx="5" fill="#f4f1ea"/>
<rect x="26" y="16" width="48" height="52" rx="1.5" fill="url(#g)"/>
<circle cx="60" cy="32" r="6" fill="#fbe3b0"/>
<path d="M26 56 C36 44 46 46 56 54 S70 62 74 61 V66.5 A1.5 1.5 0 0 1 72.5 68 H27.5 A1.5 1.5 0 0 1 26 66.5Z" fill="#000" opacity=".38"/>
</svg>
`);
console.log("icons written");

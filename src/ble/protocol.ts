// Kodak Instant BLE protocol — see docs/ble-status.md.
export const SERVICE_UUID = "9877e0cb-a4d5-4860-a50b-ac10d83b6967";
export const WRITE_UUID = "9877e0cc-a4d5-4860-a50b-ac10d83b6967";
export const STATUS_UUID = "9877e0cd-a4d5-4860-a50b-ac10d83b6967";

export const CHUNK = 200;
/** The app pauses jobs while the head is at or above this temperature. */
export const MAX_HEAD_TEMP_C = 55;

export interface PrinterStatus {
  raw: Uint8Array;
  model: number | null;
  variant: number;
  state: number;
  stateName: string;
  opcode: number;
  pass: number;
  printed: number;
  total: number;
  tempC: number;
  battery: number;
  fw: string;
  cartridge: number;
}

/** Decode the 16-byte status characteristic. */
export function decodeStatus(b: Uint8Array): PrinterStatus {
  const g = (i: number) => (i < b.length ? b[i] : 0);
  let model: number | null = null;
  const variant = g(12);
  if (b.length >= 13) {
    let i5 = g(0); if (i5 > 10) i5 -= 10;
    if (i5 === 6) i5 = 4; else if (i5 === 4) i5 = 6;
    model = variant !== 1 ? i5 + 100 : i5;
  }
  const state = g(1);
  return {
    raw: b, model, variant,
    state, stateName: ({ 0: "idle", 1: "printing", 5: "ready" } as Record<number, string>)[state] ?? `state ${state}`,
    opcode: g(3), pass: g(2), printed: g(10), total: g(11),
    tempC: (g(6) << 8) | g(7), battery: (g(4) << 8) | g(5),
    fw: b.length >= 10 ? `${g(8)}.${g(9)}` : "?", cartridge: g(14),
  };
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");

export function describeStatus(s: PrinterStatus) {
  return `${s.stateName} · pass ${s.pass} · ${s.printed}/${s.total} copies · ${s.tempC}°C · batt ${s.battery} · cart ${s.cartridge}`;
}

/** Start packet (10 B): [len₂₄][len₁₆][len₈] 00 00 00 [copies] 00 00 00 */
export function startPacket(len: number, copies: number) {
  const p = new Uint8Array(10);
  p[0] = (len >> 16) & 255; p[1] = (len >> 8) & 255; p[2] = len & 255; p[6] = copies & 255;
  return p;
}

/** Data packet (5 + N, N ≤ 200): [off₂₄][off₁₆][off₈] [N₁₅..₈][N₇..₀] + N bytes */
export function dataPacket(job: Uint8Array, off: number) {
  const n = Math.min(CHUNK, job.length - off);
  const pkt = new Uint8Array(5 + n);
  pkt[0] = (off >> 16) & 255; pkt[1] = (off >> 8) & 255; pkt[2] = off & 255; pkt[3] = (n >> 8) & 255; pkt[4] = n & 255;
  pkt.set(job.subarray(off, off + n), 5);
  return pkt;
}

/** Human-readable packet plan for a job (dry run). */
export function describeJob(job: Uint8Array, copies = 1): string[] {
  const len = job.length, n = Math.ceil(len / CHUNK);
  const last = dataPacket(job, (n - 1) * CHUNK);
  return [
    `DRY RUN: ${len.toLocaleString()} bytes, ${copies} cop${copies > 1 ? "ies" : "y"}, ${n} data packets`,
    `start packet (10B): ${hex(startPacket(len, copies))}`,
    `data[0] header: ${hex(dataPacket(job, 0).subarray(0, 5))} + ${Math.min(CHUNK, len)} bytes`,
    `data[${n - 1}] header: ${hex(last.subarray(0, 5))} + ${last.length - 5} bytes`,
    "Nothing was written to the printer.",
  ];
}

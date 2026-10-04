// Web Bluetooth connection to a Kodak Instant printer.
import { CHUNK, dataPacket, decodeStatus, MAX_HEAD_TEMP_C, SERVICE_UUID, startPacket, STATUS_UUID, WRITE_UUID, type PrinterStatus } from "./protocol";

const DEVICE_ID_KEY = "kodakDeviceId";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const bluetoothAvailable = () => typeof navigator !== "undefined" && "bluetooth" in navigator;

export type SendPhase =
  | { phase: "transfer"; sent: number; total: number }
  | { phase: "printing"; pass: number }
  | { phase: "done"; result: number; printed: number; total: number }
  | { phase: "timeout" };

export interface SendOptions {
  copies?: number;
  /** Do a GATT read (which drains queued writes) every N packets. */
  barrier: number;
  /** Extra delay per packet, ms. */
  throttle: number;
  signal?: AbortSignal;
  onProgress?: (p: SendPhase) => void;
  onStatus?: (s: PrinterStatus) => void;
  log?: (msg: string, tone?: LogTone) => void;
}

export type LogTone = "info" | "good" | "warn" | "error" | "dim";

export class AbortError extends Error {
  constructor() { super("Aborted"); this.name = "AbortError"; }
}

export class PrinterConnection {
  readonly device: BluetoothDevice;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private statusChar: BluetoothRemoteGATTCharacteristic | null = null;

  private constructor(device: BluetoothDevice) { this.device = device; }

  get name() { return this.device.name || "Printer"; }
  get connected() { return !!this.device.gatt?.connected && !!this.writeChar; }

  /** Show the browser's device chooser and connect. */
  static async request(): Promise<PrinterConnection> {
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [SERVICE_UUID] });
    const c = new PrinterConnection(device);
    await c.open();
    return c;
  }

  /** Reconnect to the last-used printer without the chooser (permitted devices persist). */
  static async reconnect(): Promise<PrinterConnection | null> {
    if (!bluetoothAvailable() || !navigator.bluetooth.getDevices) return null;
    let savedId: string | null = null;
    try { savedId = localStorage.getItem(DEVICE_ID_KEY); } catch { /* storage unavailable */ }
    const devs = await navigator.bluetooth.getDevices();
    const dev = (savedId && devs.find((d) => d.id === savedId)) || devs.find((d) => /kodak/i.test(d.name || "")) || null;
    if (!dev) return null;
    const c = new PrinterConnection(dev);
    await c.open();
    return c;
  }

  private async open() {
    const server = await this.device.gatt!.connect();
    const svc = await server.getPrimaryService(SERVICE_UUID);
    this.writeChar = await svc.getCharacteristic(WRITE_UUID);
    this.statusChar = await svc.getCharacteristic(STATUS_UUID);
    try { localStorage.setItem(DEVICE_ID_KEY, this.device.id); } catch { /* storage unavailable */ }
  }

  onDisconnect(cb: () => void) {
    const h = () => { this.writeChar = null; this.statusChar = null; cb(); };
    this.device.addEventListener("gattserverdisconnected", h);
    return () => this.device.removeEventListener("gattserverdisconnected", h);
  }

  disconnect() { this.device.gatt?.disconnect(); }

  async readStatus(): Promise<PrinterStatus> {
    if (!this.statusChar) throw new Error("Printer is not connected");
    const v = await this.statusChar.readValue();
    return decodeStatus(new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)));
  }

  /** Transfer a job and watch the print cycle until it completes. */
  async send(job: Uint8Array, o: SendOptions): Promise<void> {
    const write = this.writeChar;
    if (!write) throw new Error("Printer is not connected");
    const log = o.log ?? (() => {});
    const copies = o.copies ?? 1, len = job.length, nChunks = Math.ceil(len / CHUNK);
    const barrier = Math.max(1, o.barrier), throt = o.throttle;
    const check = () => { if (o.signal?.aborted) throw new AbortError(); };

    let s = await this.readStatus(); o.onStatus?.(s);
    if (s.tempC >= MAX_HEAD_TEMP_C) throw new Error(`Print head is ${s.tempC}°C. Let it cool below ${MAX_HEAD_TEMP_C}°C and try again.`);

    log(`SEND ${len.toLocaleString()} bytes, ${nChunks} packets, barrier/${barrier}${throt ? ` +${throt}ms` : ""}`, "info");
    await write.writeValueWithoutResponse(startPacket(len, copies));
    await sleep(Math.max(throt, 20));

    const t0 = performance.now();
    let off = 0, idx = 0;
    o.onProgress?.({ phase: "transfer", sent: 0, total: len });
    while (off < len) {
      check();
      const pkt = dataPacket(job, off);
      await write.writeValueWithoutResponse(pkt);
      off += pkt.length - 5; idx++;
      o.onProgress?.({ phase: "transfer", sent: off, total: len });
      if (throt > 0) await sleep(throt);
      // read-barrier: a GATT read forces the queued writes to drain (real flow control)
      if (idx % barrier === 0) {
        try {
          s = await this.readStatus(); o.onStatus?.(s);
          if (idx % 200 === 0) log(`  ${idx}/${nChunks} (${Math.round(off / len * 100)}%)  state=${s.state} pass=${s.pass}`, "dim");
        } catch { /* a missed barrier read is not fatal */ }
      }
    }
    const secs = (performance.now() - t0) / 1000;
    log(`Transfer complete: ${idx} packets in ${secs.toFixed(1)}s (${(len / 1024 / secs).toFixed(0)} KB/s)`, "good");

    // watch the print cycle: byte[1] 0→1 (printing), byte[2] counts passes, back to 0 + byte[10]≥byte[11] when done
    o.onProgress?.({ phase: "printing", pass: 0 });
    let wasPrinting = false, lastPass = -1;
    for (let i = 0; i < 120; i++) {
      await sleep(1500);
      check();
      try { s = await this.readStatus(); } catch { continue; }
      o.onStatus?.(s);
      if (s.state === 1) {
        wasPrinting = true;
        if (s.pass !== lastPass) { lastPass = s.pass; o.onProgress?.({ phase: "printing", pass: s.pass }); log(`  printing… pass ${s.pass}`, "dim"); }
      } else if (s.state === 0 && (wasPrinting || s.printed >= s.total)) {
        log(`Print complete (result ${s.pass}, ${s.printed}/${s.total} copies)`, "good");
        o.onProgress?.({ phase: "done", result: s.pass, printed: s.printed, total: s.total });
        return;
      }
    }
    log("Stopped watching (timeout). The printer may still be working.", "warn");
    o.onProgress?.({ phase: "timeout" });
  }
}

import { useCallback, useEffect, useRef, useState } from "react";
import { AbortError, bluetoothAvailable, PrinterConnection, type LogTone, type SendPhase } from "../ble/printer";
import { hex, type PrinterStatus } from "../ble/protocol";

export interface LogEntry { id: number; time: string; msg: string; tone: LogTone }
export type ConnState = "disconnected" | "connecting" | "connected";

const MAX_LOG = 400;

export function usePrinter() {
  const [conn, setConn] = useState<PrinterConnection | null>(null);
  const [connState, setConnState] = useState<ConnState>("disconnected");
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState<SendPhase | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logId = useRef(0);

  const addLog = useCallback((msg: string, tone: LogTone = "info") => {
    const e = { id: ++logId.current, time: new Date().toLocaleTimeString(), msg, tone };
    setLog((l) => (l.length >= MAX_LOG ? [...l.slice(-MAX_LOG + 1), e] : [...l, e]));
  }, []);

  const onStatus = useCallback((s: PrinterStatus) => setStatus(s), []);

  const attach = useCallback(async (c: PrinterConnection) => {
    c.onDisconnect(() => {
      addLog("Disconnected", "warn");
      setConn((cur) => (cur === c ? null : cur));
      setConnState("disconnected");
    });
    setConn(c); setConnState("connected");
    addLog(`Connected to ${c.name}`, "good");
    try {
      const s = await c.readStatus();
      setStatus(s);
      addLog(`status ${hex(s.raw)}`, "dim");
    } catch (e) { addLog(`Status read failed: ${(e as Error).message}`, "error"); }
  }, [addLog]);

  const connect = useCallback(async () => {
    setConnState("connecting");
    try {
      await attach(await PrinterConnection.request());
    } catch (e) {
      setConnState("disconnected");
      const err = e as DOMException;
      // NotFoundError = the user closed the chooser
      if (err.name !== "NotFoundError") { addLog(`Connect failed: ${err.message}`, "error"); throw e; }
    }
  }, [attach, addLog]);

  // auto-reconnect to the last-used printer on load
  useEffect(() => {
    if (!bluetoothAvailable() || !window.isSecureContext) return;
    let cancelled = false;
    (async () => {
      try {
        setConnState("connecting");
        const c = await PrinterConnection.reconnect();
        if (cancelled) { c?.disconnect(); return; }
        if (c) await attach(c); else setConnState("disconnected");
      } catch (e) {
        if (!cancelled) { setConnState("disconnected"); addLog(`Auto-reconnect skipped (${(e as Error).message})`, "dim"); }
      }
    })();
    return () => { cancelled = true; };
  }, [attach, addLog]);

  const disconnect = useCallback(() => { conn?.disconnect(); }, [conn]);

  const reread = useCallback(async () => {
    if (!conn) return;
    try { const s = await conn.readStatus(); setStatus(s); addLog(`status ${hex(s.raw)}`, "dim"); }
    catch (e) { addLog(`Re-read failed: ${(e as Error).message}`, "error"); }
  }, [conn, addLog]);

  /** Resolves true when the print finished, false if aborted. Throws on failure. */
  const send = useCallback(async (bytes: Uint8Array, opts: { barrier: number; throttle: number }) => {
    if (!conn) throw new Error("Printer is not connected");
    const ac = new AbortController();
    abortRef.current = ac;
    setSending(true); setProgress({ phase: "transfer", sent: 0, total: bytes.length });
    try {
      await conn.send(bytes, { ...opts, signal: ac.signal, onProgress: setProgress, onStatus, log: addLog });
      return true;
    } catch (e) {
      if (e instanceof AbortError) { addLog("Aborted", "warn"); return false; }
      addLog(`Send failed: ${(e as Error).message}`, "error");
      throw e;
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }, [conn, onStatus, addLog]);

  const abort = useCallback(() => { abortRef.current?.abort(); addLog("Abort requested…", "warn"); }, [addLog]);
  const clearProgress = useCallback(() => setProgress(null), []);
  const clearLog = useCallback(() => setLog([]), []);

  return { conn, connState, status, log, addLog, clearLog, progress, clearProgress, sending, connect, disconnect, reread, send, abort };
}

export type Printer = ReturnType<typeof usePrinter>;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrinter } from "./hooks/usePrinter";
import { usePipeline } from "./hooks/usePipeline";
import { usePersistentState } from "./hooks/usePersistentState";
import { useWakeLock } from "./hooks/useWakeLock";
import { bluetoothAvailable } from "./ble/printer";
import { CHUNK, describeJob } from "./ble/protocol";
import { MODELS, profileFor } from "./pipeline/models";
import type { Transform } from "./pipeline/compose";
import { autoLayout, frameSize, layoutTransform } from "./pipeline/resizeCrop";
import { DEFAULT_SETTINGS, type PipelineSettings } from "./pipeline/settings";
import type { PipelineJob } from "./pipeline/run";
import { TopBar } from "./components/TopBar";
import { EnvBanner } from "./components/EnvBanner";
import { PhotoInput, PhotoPicker, firstImage } from "./components/PhotoPicker";
import { ComposeView } from "./components/ComposeView";
import { PreviewView } from "./components/PreviewView";
import { AdvancedPanel, type TransferSettings } from "./components/AdvancedPanel";
import { PrintBar } from "./components/PrintBar";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Sheet } from "./components/Sheet";
import { Toasts, useToasts } from "./components/Toasts";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { IconFit, IconImage, IconRotate, IconUndo } from "./components/icons";

/** BLE cartridges report chip 1. */
const CHIP = 1;
const DEFAULT_TRANSFER: TransferSettings = { barrier: 16, throttle: 0 };
type View = "frame" | "preview";

export default function App() {
  const printer = usePrinter();
  const { toasts, show: toast, dismiss } = useToasts();
  const [file, setFile] = useState<File | null>(null);
  const [settings, setSettings] = usePersistentState<PipelineSettings>("kodak.settings.v2", DEFAULT_SETTINGS);
  const [transfer, setTransfer] = usePersistentState<TransferSettings>("kodak.transfer.v1", DEFAULT_TRANSFER);
  // manual crop framing (null = exact auto crop) and its undo history
  const [manual, setManual] = useState<Transform | null>(null);
  const [history, setHistory] = useState<(Transform | null)[]>([]);
  const gestureFrom = useRef<Transform | null | undefined>(undefined);
  const [view, setView] = useState<View>("frame");
  const [upright, setUpright] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { clearProgress, addLog } = printer;

  const btOk = bluetoothAvailable() && window.isSecureContext;
  const connected = printer.connState === "connected";
  const model = printer.status?.model;
  const profileIdx = model != null ? profileFor(model) : 0;
  const m = MODELS[profileIdx];
  const modelLabel = `${m.rw}×${m.rh}${model != null ? ` · model ${model}` : " (default)"}`;

  // framing resets when the photo, page size or content rect changes
  useEffect(() => { setManual(null); setHistory([]); }, [file, profileIdx]);

  const loadFile = useCallback((f: File) => { setFile(f); setView("frame"); clearProgress(); }, [clearProgress]);

  // paste an image from the clipboard; drop anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const f = firstImage(e.clipboardData?.files); if (f) loadFile(f); };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => { e.preventDefault(); const f = firstImage(e.dataTransfer?.files); if (f) loadFile(f); };
    addEventListener("paste", onPaste); addEventListener("dragover", onDragOver); addEventListener("drop", onDrop);
    return () => { removeEventListener("paste", onPaste); removeEventListener("dragover", onDragOver); removeEventListener("drop", onDrop); };
  }, [loadFile]);

  const job = useMemo<PipelineJob>(() => ({
    profileIdx, chip: CHIP, settings,
    transform: manual,
  }), [profileIdx, settings, manual]);

  const { source, output, busy, error } = usePipeline(file, job);

  useEffect(() => { if (error) toast(error, "error"); }, [error, toast]);

  // crop frame (post-shrink size, oriented like the auto crop) and the effective framing
  const auto = useMemo(() => (source ? autoLayout(source.width, source.height, m.rw, m.rh, CHIP) : null), [source, m]);
  const srcLandscape = !!auto?.landscape;
  const { fw, fh } = frameSize(m.rw, m.rh, CHIP, srcLandscape);
  const transform = useMemo(
    () => (source && auto ? manual ?? layoutTransform(auto, source.width) : null),
    [source, auto, manual],
  );

  // a gesture becomes one undo step, recorded only once it actually changes something
  const onGestureStart = useCallback(() => { gestureFrom.current = manual; }, [manual]);
  const onFrameChange = useCallback((t: Transform) => {
    if (gestureFrom.current !== undefined) {
      const from = gestureFrom.current;
      setHistory((h) => [...h.slice(-49), from]);
      gestureFrom.current = undefined;
    }
    setManual(t);
  }, []);
  const onReset = useCallback(() => {
    if (manual === null) return;
    setHistory((h) => [...h.slice(-49), manual]);
    setManual(null);
  }, [manual]);
  const onUndo = useCallback(() => {
    if (!history.length) return;
    setManual(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  }, [history]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault(); onUndo();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onUndo]);

  const connect = useCallback(async () => {
    try { await printer.connect(); } catch (e) { toast(`Couldn't connect: ${(e as Error).message}`, "error"); }
  }, [printer.connect, toast]);

  const print = useCallback(async () => {
    setConfirming(false);
    if (!output) return;
    try {
      const ok = await printer.send(output.bytes, transfer);
      if (ok) toast("Printed!", "good");
    } catch (e) {
      toast((e as Error).message, "error", 7000);
      clearProgress();
    }
  }, [output, printer.send, transfer, toast, clearProgress]);

  const download = useCallback(() => {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output.bytes as BlobPart], { type: "image/jpeg" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(source?.name ?? "photo").replace(/\.[^.]+$/, "")}-${output.width}x${output.height}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [output, source]);

  const dryRun = useCallback(() => {
    if (!output) return;
    describeJob(output.bytes).forEach((l, i, a) => addLog(l, i === a.length - 1 ? "good" : "info"));
    toast("Dry run logged", "info", 2000);
  }, [output, addLog, toast]);

  // keep the screen on and warn before leaving while a print is in flight
  useWakeLock(printer.sending);
  useEffect(() => {
    if (!printer.sending) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    addEventListener("beforeunload", h);
    return () => removeEventListener("beforeunload", h);
  }, [printer.sending]);

  // clear the "Printed" bar a little after completion
  useEffect(() => {
    const ph = printer.progress?.phase;
    if (ph !== "done" && ph !== "timeout") return;
    const t = setTimeout(clearProgress, 5000);
    return () => clearTimeout(t);
  }, [printer.progress, clearProgress]);

  const packets = output ? Math.ceil(output.bytes.length / CHUNK) : 0;
  const advanced = (
    <AdvancedPanel
      settings={settings} onSettings={setSettings} onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
      transfer={transfer} onTransfer={setTransfer}
      status={printer.status} connected={connected} modelLabel={modelLabel} onReread={printer.reread}
      canDryRun={!!output} onDryRun={dryRun}
      log={printer.log} onClearLog={printer.clearLog}
    />
  );

  return (
    <div className="app">
      <TopBar
        connState={printer.connState} name={printer.conn?.name ?? null} status={printer.status} canConnect={btOk}
        onConnect={connect} onDisconnect={printer.disconnect} onOpenAdvanced={() => setAdvancedOpen(true)}
      />
      <EnvBanner />

      <div className="layout">
        <aside className="sidebar" aria-label="Advanced settings">{advanced}</aside>

        <main className="main">
          {!file ? (
            <PhotoPicker onFile={loadFile} />
          ) : (
            <>
              <div className="toolbar">
                <div className="segmented" role="tablist" aria-label="View">
                  <button role="tab" aria-selected={view === "frame"} className={view === "frame" ? "on" : ""} onClick={() => setView("frame")}>Frame</button>
                  <button role="tab" aria-selected={view === "preview"} className={view === "preview" ? "on" : ""} onClick={() => setView("preview")}>Print preview</button>
                </div>
                <div className="toolbar-actions">
                  {view === "frame" ? (
                    <>
                      <button className="btn sm ghost" onClick={onUndo} disabled={!history.length} title="Undo (⌘Z)" aria-label="Undo">
                        <IconUndo width={16} height={16} /><span className="hide-xs">Undo</span>
                      </button>
                      <button className="btn sm ghost" onClick={onReset} disabled={manual === null} title="Reset to the automatic crop (double-tap)" aria-label="Reset crop">
                        <IconFit width={16} height={16} /><span className="hide-xs">Reset</span>
                      </button>
                    </>
                  ) : m.rh === 1024 && (
                    <button className={`btn sm ghost ${upright ? "" : "active"}`} onClick={() => setUpright((u) => !u)}
                      title="The 640×1024 profile is stored upside-down and the printer flips it back">
                      <IconRotate width={16} height={16} /><span className="hide-xs">{upright ? "Upright" : "As sent"}</span>
                    </button>
                  )}
                  <button className="btn sm ghost" onClick={() => fileInput.current?.click()}>
                    <IconImage width={16} height={16} /><span className="hide-xs">Change photo</span>
                  </button>
                  <PhotoInput ref={fileInput} onFile={loadFile} />
                </div>
              </div>

              <div className="stage">
                {view === "frame" && source && transform && (
                  <ComposeView source={source} fw={fw} fh={fh} transform={transform}
                    onGestureStart={onGestureStart} onChange={onFrameChange} onReset={onReset} />
                )}
                {view === "preview" && output && <PreviewView output={output} upright={upright} />}
                {(!source || (view === "preview" && !output)) && !error && <div className="stage-empty"><span className="spinner" />Processing…</div>}
                {busy && source && <div className="busy" aria-label="Processing"><span className="spinner" /></div>}
              </div>

              <div className="stats">
                <span>{m.rw}×{m.rh}</span>
                {output && <><span>{(output.bytes.length / 1024).toFixed(0)} KB</span><span>{packets} packets</span><span>q{output.quality}</span><span className="hide-xs">{output.ms.toFixed(0)} ms</span></>}
                <span className="hint">{view === "frame" ? `${manual ? "Custom crop" : "Auto crop"}${srcLandscape ? " · rotated 90° onto the print" : ""}` : "Exact pixels sent · pinch/scroll to zoom"}</span>
              </div>
            </>
          )}
        </main>
      </div>

      <PrintBar
        ready={!!output} busy={busy} connected={connected} canConnect={btOk} sending={printer.sending} progress={printer.progress}
        onPrint={() => setConfirming(true)} onConnect={connect} onAbort={printer.abort} onDownload={download}
      />

      <Sheet open={advancedOpen} title="Advanced" onClose={() => setAdvancedOpen(false)}>{advanced}</Sheet>

      <ConfirmDialog open={confirming} title="Print this photo?" confirmLabel="Print" onConfirm={print} onCancel={() => setConfirming(false)}>
        Sends {packets.toLocaleString()} packets ({output ? (output.bytes.length / 1024).toFixed(0) : 0} KB) to {printer.conn?.name ?? "the printer"} and uses one sheet of film.
        Keep this page open until the print finishes.
      </ConfirmDialog>

      <Toasts toasts={toasts} dismiss={dismiss} />
      <UpdatePrompt busy={printer.sending} />
    </div>
  );
}

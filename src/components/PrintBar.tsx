import type { SendPhase } from "../ble/printer";
import { IconDownload, IconPrinter } from "./icons";

interface Props {
  ready: boolean;
  busy: boolean;
  connected: boolean;
  canConnect: boolean;
  sending: boolean;
  progress: SendPhase | null;
  onPrint: () => void;
  onConnect: () => void;
  onAbort: () => void;
  onDownload: () => void;
}

function describe(p: SendPhase | null): { text: string; pct: number; printing: boolean } | null {
  if (!p) return null;
  switch (p.phase) {
    case "transfer": { const pct = Math.round((p.sent / p.total) * 100); return { text: `Sending… ${pct}%`, pct, printing: false }; }
    case "printing": return { text: p.pass ? `Printing… pass ${p.pass}` : "Printing…", pct: 100, printing: true };
    case "done": return { text: "Printed", pct: 100, printing: false };
    case "timeout": return { text: "Sent. The printer is still working", pct: 100, printing: false };
  }
}

export function PrintBar(p: Props) {
  const d = describe(p.progress);
  return (
    <footer className="printbar">
      {d && (
        <div className={`progress ${d.printing ? "printing" : ""}`} role="progressbar" aria-valuenow={d.pct} aria-valuemin={0} aria-valuemax={100} aria-label={d.text}>
          <div className="progress-bar" style={{ width: `${d.pct}%` }} />
        </div>
      )}
      <div className="printbar-inner">
        <button className="btn icon" onClick={p.onDownload} disabled={!p.ready} aria-label="Save JPEG" title="Save the exact JPEG">
          <IconDownload />
        </button>
        {p.sending ? (
          <>
            <span className="printbar-status">{d?.text}</span>
            <button className="btn danger" onClick={p.onAbort}>Abort</button>
          </>
        ) : !p.connected ? (
          <button className="btn primary wide" onClick={p.onConnect} disabled={!p.canConnect}>
            {p.canConnect ? "Connect printer" : "Bluetooth unavailable"}
          </button>
        ) : (
          <button className="btn send wide" onClick={p.onPrint} disabled={!p.ready || p.busy}>
            <IconPrinter /> {d && !p.sending && p.progress?.phase === "done" ? "Print again" : p.busy ? "Processing…" : "Print"}
          </button>
        )}
      </div>
    </footer>
  );
}

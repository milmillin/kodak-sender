import type { PrinterStatus } from "../ble/protocol";
import type { ConnState } from "../hooks/usePrinter";
import { IconBluetooth, IconSliders } from "./icons";

interface Props {
  connState: ConnState;
  name: string | null;
  status: PrinterStatus | null;
  canConnect: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenAdvanced: () => void;
}

export function TopBar({ connState, name, status, canConnect, onConnect, onDisconnect, onOpenAdvanced }: Props) {
  const on = connState === "connected";
  const detail = on && status ? [status.tempC ? `${status.tempC}°C` : null, `fw ${status.fw}`].filter(Boolean).join(" · ") : null;
  return (
    <header className="topbar">
      <div className="brand">
        <img src="./icon.svg" alt="" width={26} height={26} />
        <span>Kodak Sender</span>
      </div>
      <div className={`chip ${connState}`} role="status" aria-live="polite">
        <span className="dot" />
        <span className="chip-text">
          {connState === "connecting" ? "Connecting…" : on ? (name ?? "Printer") : "Not connected"}
          {detail && <small>{detail}</small>}
        </span>
      </div>
      <div className="topbar-actions">
        {on ? (
          <button className="btn ghost" onClick={onDisconnect}>Disconnect</button>
        ) : (
          <button className="btn primary" onClick={onConnect} disabled={!canConnect || connState === "connecting"}>
            <IconBluetooth width={18} height={18} /><span className="hide-xs">Connect</span>
          </button>
        )}
        <button className="btn icon only-mobile" onClick={onOpenAdvanced} aria-label="Advanced settings">
          <IconSliders />
        </button>
      </div>
    </header>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import { STAGES, type PipelineSettings, type StageId } from "../pipeline/settings";
import type { DownscaleMode } from "../pipeline/resizeCrop";
import { hex, type PrinterStatus } from "../ble/protocol";
import type { LogEntry } from "../hooks/usePrinter";
import { IconRefresh } from "./icons";

export interface TransferSettings { barrier: number; throttle: number }

interface Props {
  settings: PipelineSettings;
  onSettings: (s: PipelineSettings) => void;
  onResetSettings: () => void;
  transfer: TransferSettings;
  onTransfer: (t: TransferSettings) => void;
  status: PrinterStatus | null;
  connected: boolean;
  modelLabel: string;
  onReread: () => void;
  canDryRun: boolean;
  onDryRun: () => void;
  log: LogEntry[];
  onClearLog: () => void;
}

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

function Range({ label, value, min, max, step = 1, format, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="range">
      <span className="range-label">{label}<output>{format(value)}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

export function AdvancedPanel(p: Props) {
  const { settings: s, onSettings } = p;
  const set = <K extends keyof PipelineSettings>(k: K, v: PipelineSettings[K]) => onSettings({ ...s, [k]: v });
  const toggle = (id: StageId, on: boolean) => onSettings({ ...s, stages: { ...s.stages, [id]: on } });

  return (
    <div className="advanced">
      <Section title="Printer" open>
        <dl className="kv">
          <dt>Profile</dt><dd>{p.modelLabel}</dd>
          {p.status ? (
            <>
              <dt>Model</dt><dd>{p.status.model ?? "—"}</dd>
              <dt>Firmware</dt><dd>{p.status.fw}</dd>
              <dt>State</dt><dd>{p.status.stateName}</dd>
              <dt>Head temp</dt><dd>{p.status.tempC} °C</dd>
              <dt>Battery</dt><dd>{p.status.battery}</dd>
              <dt>Cartridge</dt><dd>{p.status.cartridge}</dd>
              <dt>Raw</dt><dd className="raw">{hex(p.status.raw)}</dd>
            </>
          ) : (
            <><dt>Status</dt><dd className="muted">{p.connected ? "reading…" : "not connected"}</dd></>
          )}
        </dl>
        <button className="btn sm" onClick={p.onReread} disabled={!p.connected}><IconRefresh width={16} height={16} /> Re-read status</button>
      </Section>

      <Section title="Image pipeline">
        <label className="field">
          <span>Downscale</span>
          <select value={s.dsMode} onChange={(e) => set("dsMode", e.target.value as DownscaleMode)}>
            <option value="stbir">stb · Mitchell (app)</option>
            <option value="dpid">Detail-preserving (DPID)</option>
            <option value="bilinear">Bilinear</option>
          </select>
        </label>
        {s.dsMode === "dpid" && (
          <Range label="Detail λ" value={s.dsLambda} min={0} max={2} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => set("dsLambda", v)} />
        )}
        <ol className="stages">
          {STAGES.map((st) => {
            const on = s.stages[st.id];
            return (
              <li key={st.id} className={on ? "" : "off"}>
                <label className="stage-row">
                  <span className="stage-name">{st.name}<small>{st.desc}</small></span>
                  <span className="switch">
                    <input type="checkbox" role="switch" checked={on} disabled={st.lock} onChange={(e) => toggle(st.id, e.target.checked)} />
                    <span />
                  </span>
                </label>
                {st.id === "sharpen" && on && (
                  <>
                    <Range label="High-pass" value={s.hp} min={0} max={1.5} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set("hp", v)} />
                    <Range label="USM" value={s.usm} min={0} max={1.5} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set("usm", v)} />
                  </>
                )}
                {st.id === "jpeg" && (
                  <Range label="Quality" value={s.quality} min={40} max={100} format={(v) => `${v}%`} onChange={(v) => set("quality", v)} />
                )}
              </li>
            );
          })}
        </ol>
        <button className="btn sm ghost" onClick={p.onResetSettings}>Reset to defaults</button>
      </Section>

      <Section title="Transfer">
        <Range label="Read-barrier every" value={p.transfer.barrier} min={1} max={64} format={(v) => `${v} pkts`} onChange={(v) => p.onTransfer({ ...p.transfer, barrier: v })} />
        <Range label="Extra delay" value={p.transfer.throttle} min={0} max={40} format={(v) => `${v} ms`} onChange={(v) => p.onTransfer({ ...p.transfer, throttle: v })} />
        <button className="btn sm" onClick={p.onDryRun} disabled={!p.canDryRun}>Dry run (log packets only)</button>
      </Section>

      <Section title={`Log${p.log.length ? ` (${p.log.length})` : ""}`}>
        <LogView log={p.log} />
        <button className="btn sm ghost" onClick={p.onClearLog} disabled={!p.log.length}>Clear log</button>
      </Section>
    </div>
  );
}

function LogView({ log }: { log: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);
  return (
    <div className="log" ref={ref} role="log" aria-live="polite">
      {log.length === 0 && <div className="muted">Nothing yet.</div>}
      {log.map((e) => (
        <div key={e.id} className={`log-${e.tone}`}><span className="log-time">{e.time}</span> {e.msg}</div>
      ))}
    </div>
  );
}

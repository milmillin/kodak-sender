import { useRegisterSW } from "virtual:pwa-register/react";

/** Offers a reload when a new version is deployed (never auto-reloads, so a print can't be interrupted). */
export function UpdatePrompt({ busy }: { busy: boolean }) {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh || busy) return null;
  return (
    <div className="update" role="status">
      <span>A new version is available.</span>
      <button className="btn sm primary" onClick={() => updateServiceWorker(true)}>Reload</button>
      <button className="btn sm ghost" onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  );
}

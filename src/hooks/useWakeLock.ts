import { useEffect } from "react";

/** Hold a screen wake lock while `active` — a phone that sleeps mid-transfer drops the BLE link. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) l.release(); else lock = l;
      } catch { /* denied or unsupported */ }
    };
    // the lock is dropped whenever the page is hidden; take it again on return
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      lock?.release();
    };
  }, [active]);
}

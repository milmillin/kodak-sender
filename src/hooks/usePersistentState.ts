import { useEffect, useState } from "react";

/** useState backed by localStorage. Storage failures (private mode, quota) are ignored. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      // merge so newly added fields get their defaults
      return initial && typeof initial === "object" && !Array.isArray(initial) ? { ...initial, ...parsed } : parsed;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue] as const;
}

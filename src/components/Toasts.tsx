import { useCallback, useRef, useState } from "react";

export type ToastTone = "info" | "good" | "error";
interface Toast { id: number; text: string; tone: ToastTone }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((text: string, tone: ToastTone = "info", ms = 4500) => {
    const id = ++n.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);
  return { toasts, show, dismiss };
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="assertive">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>{t.text}</button>
      ))}
    </div>
  );
}

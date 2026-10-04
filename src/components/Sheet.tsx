import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./icons";

/** Bottom sheet (mobile) built on <dialog> for focus trapping and Esc handling. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-label={title} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="sheet-head">
        <h2>{title}</h2>
        <button className="btn icon ghost" onClick={onClose} aria-label="Close"><IconX /></button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}

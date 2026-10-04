import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => { e.preventDefault(); onCancel(); }}
      onClick={(e) => { if (e.target === ref.current) onCancel(); }}>
      <div className="dialog-body">
        <h2>{title}</h2>
        <div className="dialog-text">{children}</div>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn send" onClick={onConfirm} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

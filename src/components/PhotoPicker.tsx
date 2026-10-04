import { useRef, useState } from "react";
import { IconImage } from "./icons";

export function firstImage(files: FileList | null | undefined): File | null {
  if (!files) return null;
  for (const f of files) if (f.type.startsWith("image/") || /\.(heic|heif|avif|webp)$/i.test(f.name)) return f;
  return null;
}

/** Empty state: tap to pick a photo, or drop / paste one. */
export function PhotoPicker({ onFile }: { onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`picker ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = firstImage(e.dataTransfer.files); if (f) onFile(f); }}
    >
      <button className="picker-btn" onClick={() => input.current?.click()}>
        <span className="picker-icon"><IconImage width={34} height={34} /></span>
        <strong>Choose a photo</strong>
        <span className="muted">or drop or paste one here</span>
      </button>
      <PhotoInput ref={input} onFile={onFile} />
    </div>
  );
}

export function PhotoInput({ ref, onFile }: { ref: React.Ref<HTMLInputElement>; onFile: (f: File) => void }) {
  return (
    <input ref={ref} type="file" accept="image/*" hidden
      onChange={(e) => { const f = firstImage(e.target.files); if (f) onFile(f); e.target.value = ""; }} />
  );
}

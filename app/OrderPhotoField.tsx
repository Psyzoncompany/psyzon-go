"use client";

import { useState, type ChangeEvent } from "react";
import { Camera, Trash2 } from "lucide-react";
import { prepareOrderPhoto } from "./order-photo";

export default function OrderPhotoField({ initialValue = "", value, onPhotoChange, label = "Foto do pedido", includeFormField = true, thumbnailLimit, onBusyChange }: { initialValue?: string; value?: string; onPhotoChange?: (photo: string) => void; label?: string; includeFormField?: boolean; thumbnailLimit?: number; onBusyChange: (busy: boolean) => void }) {
  const [localPhoto, setLocalPhoto] = useState(initialValue);
  const photo = value ?? localPhoto;
  const setPhoto = (next: string) => { setLocalPhoto(next); onPhotoChange?.(next); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setBusy(true); onBusyChange(true);
    try {
      setPhoto(await prepareOrderPhoto(file, { dimension: thumbnailLimit ? 300 : 1200, limit: thumbnailLimit ?? 450000, fallbackQuality: thumbnailLimit ? .26 : .5 }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir a foto."); }
    finally { setBusy(false); onBusyChange(false); event.target.value = ""; }
  };
  return <div className="order-photo-field">{includeFormField && <input type="hidden" name="photoData" value={photo} />}<label className="full"><span><Camera size={15} /> {label}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => void upload(event)} /></label>{photo && <div className="order-photo-preview"><img src={photo} alt={label} /><button type="button" className="secondary" onClick={() => setPhoto("")}><Trash2 size={14} /> Remover foto</button></div>}{busy && <p role="status">Preparando foto…</p>}{error && <p role="alert" className="form-error">{error}</p>}</div>;
}

"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { prepareOrderPhoto } from "./order-photo";
import "./order-photo-field.css";

export default function OrderPhotoField({ initialValue = "", value, onPhotoChange, label = "Foto do pedido", includeFormField = true, thumbnailLimit, onBusyChange }: { initialValue?: string; value?: string; onPhotoChange?: (photo: string) => void | Promise<void>; label?: string; includeFormField?: boolean; thumbnailLimit?: number; onBusyChange: (busy: boolean) => void }) {
  const [localPhoto, setLocalPhoto] = useState(initialValue);
  const fileInput = useRef<HTMLInputElement>(null);
  const photo = value ?? localPhoto;
  const setPhoto = async (next: string) => { await onPhotoChange?.(next); setLocalPhoto(next); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError(""); setBusy(true); onBusyChange(true);
    try {
      await setPhoto(await prepareOrderPhoto(file, { dimension: thumbnailLimit ? 300 : 1200, limit: thumbnailLimit ?? 450000, fallbackQuality: thumbnailLimit ? .26 : .5 }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir a foto."); }
    finally { setBusy(false); onBusyChange(false); input.value = ""; }
  };
  const remove = async () => {
    setError(""); setBusy(true); onBusyChange(true);
    try { await setPhoto(""); } catch { setError("Não foi possível remover a foto. Tente novamente."); }
    finally { setBusy(false); onBusyChange(false); }
  };
  return (
    <div className="order-photo-field compact-photo-field" aria-busy={busy}>
      {includeFormField && <input type="hidden" name="photoData" value={photo} />}
      <input ref={fileInput} type="file" hidden aria-label={label} accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => void upload(event)} />
      {photo ? (
        <div className="order-photo-preview">
          <button type="button" className="photo-thumbnail" aria-label="Trocar foto" disabled={busy} onClick={() => fileInput.current?.click()}>
            <img src={photo} alt={label} />
          </button>
          <div className="photo-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => fileInput.current?.click()}><Camera size={16} aria-hidden="true" /> Trocar</button>
            <button type="button" className="secondary photo-remove" aria-label="Remover foto" title="Remover foto" disabled={busy} onClick={() => void remove()}><Trash2 size={16} aria-hidden="true" /></button>
          </div>
        </div>
      ) : (
        <button type="button" className="photo-add" disabled={busy} onClick={() => fileInput.current?.click()}><Camera size={20} aria-hidden="true" /> Adicionar foto</button>
      )}
      {busy && <p className="photo-status" role="status"><LoaderCircle size={14} aria-hidden="true" /> Preparando foto…</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>
  );
}

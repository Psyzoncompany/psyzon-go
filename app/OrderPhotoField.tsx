"use client";

import { useState, type ChangeEvent } from "react";
import { Camera, Trash2 } from "lucide-react";

export default function OrderPhotoField({ initialValue = "", value, onPhotoChange, label = "Foto do pedido", includeFormField = true, onBusyChange }: { initialValue?: string; value?: string; onPhotoChange?: (photo: string) => void; label?: string; includeFormField?: boolean; onBusyChange: (busy: boolean) => void }) {
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
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Use uma foto JPG, PNG ou WebP de até 10 MB.");
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar a foto.");
        context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        let result = canvas.toDataURL("image/jpeg", .8);
        if (result.length > 450000) result = canvas.toDataURL("image/jpeg", .5);
        if (result.length > 450000) throw new Error("A foto ainda ficou muito grande. Escolha uma imagem menor.");
        setPhoto(result);
      } finally { bitmap.close(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível abrir a foto."); }
    finally { setBusy(false); onBusyChange(false); event.target.value = ""; }
  };
  return <div className="order-photo-field">{includeFormField && <input type="hidden" name="photoData" value={photo} />}<label className="full"><span><Camera size={15} /> {label}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => void upload(event)} /></label>{photo && <div className="order-photo-preview"><img src={photo} alt={label} /><button type="button" className="secondary" onClick={() => setPhoto("")}><Trash2 size={14} /> Remover foto</button></div>}{busy && <p role="status">Preparando foto…</p>}{error && <p role="alert" className="form-error">{error}</p>}</div>;
}

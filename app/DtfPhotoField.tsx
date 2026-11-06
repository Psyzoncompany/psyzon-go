"use client";

import Image from "next/image";
import { Camera, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { maxDtfPhotos, packDtfPhotos } from "./dtf-model";
import { prepareOrderPhoto } from "./order-photo";

export default function DtfPhotoField({ photos, setPhotos, onBusyChange }: { photos: string[]; setPhotos: (photos: string[]) => void; onBusyChange: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (!files.length || busy) return;
    const remaining = maxDtfPhotos - photos.length;
    const next = [...photos];
    const problems = new Set<string>();
    setBusy(true);
    onBusyChange(true);
    setError("");
    if (files.length > remaining) problems.add(`Você pode adicionar até ${maxDtfPhotos} imagens por pedido.`);
    try {
      for (const file of files.slice(0, remaining)) {
        try {
          const photo = await prepareOrderPhoto(file, { dimension: 640, limit: 55000, fallbackQuality: .3 });
          packDtfPhotos([...next, photo]);
          next.push(photo);
        } catch (cause) {
          problems.add(cause instanceof Error ? cause.message : "Não foi possível abrir uma das imagens.");
        }
      }
      setPhotos(next);
      setError([...problems].join(" "));
    } finally {
      input.value = "";
      setBusy(false);
      onBusyChange(false);
    }
  }

  return <div className="dtf-photo-field">
    <label className="dtf-photo-picker" data-disabled={busy || photos.length >= maxDtfPhotos}>
      <Camera size={16} /><strong>Adicionar imagens de referência</strong>
      <input className="dtf-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || photos.length >= maxDtfPhotos} onChange={event => void upload(event)} />
      {photos.length > 0 && <small>{photos.length}/{maxDtfPhotos}</small>}
    </label>
    {photos.length > 0 && <ul className="dtf-photo-list">{photos.map((photo, index) => <li key={index}>
      <Image src={photo} unoptimized width={120} height={120} alt={`Referência ${index + 1}`} />
      <button type="button" aria-label={`Remover imagem ${index + 1}`} disabled={busy} onClick={() => { setPhotos(photos.filter((_, position) => position !== index)); setError(""); }}><X size={14} /></button>
    </li>)}</ul>}
    {busy && <p role="status" className="form-help">Preparando imagens…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}

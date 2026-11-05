"use client";

import { useState, type FormEvent } from "react";
import { LockKeyhole, X } from "lucide-react";
import Modal from "./Modal";

export default function ValuesPrivacyDialog({ hide, getToken, close, confirm }: { hide: boolean; getToken: () => Promise<string>; close: () => void; confirm: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = hide ? "Ocultar valores" : "Mostrar valores";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const pin = new FormData(form).get("pin");
    form.reset();
    setError("");
    setBusy(true);
    try {
      const token = await getToken();
      const response = await fetch("/api/values-privacy", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível verificar a senha.");
      }
      confirm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível verificar a senha.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal titleId="values-privacy-title" busy={busy} close={close}>
    <header><h2 id="values-privacy-title">{action}</h2><button type="button" onClick={close} disabled={busy} aria-label="Fechar"><X size={20} /></button></header>
    <form onSubmit={submit}>
      <p className="form-help">Digite a senha de privacidade para confirmar.</p>
      <label className="full">Senha de privacidade<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="secondary" onClick={close} disabled={busy}>Cancelar</button><button type="submit" className="primary" disabled={busy}><LockKeyhole size={16} />{busy ? "Verificando…" : action}</button></footer>
    </form>
  </Modal>;
}

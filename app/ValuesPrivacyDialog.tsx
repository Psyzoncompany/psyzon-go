"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LockKeyhole, X } from "lucide-react";
import Modal from "./Modal";

export default function ValuesPrivacyDialog({ hide, getToken, close, confirm }: { hide: boolean; getToken: () => Promise<string>; close: () => void; confirm: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const action = hide ? "Ocultar totais financeiros" : "Mostrar totais financeiros";
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const form = event.currentTarget;
    const pin = new FormData(form).get("pin");
    form.reset();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setBusy(true);
    try {
      const token = await getToken();
      const response = await fetch("/api/values-privacy", {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível verificar a senha.");
      }
      if (!controller.signal.aborted) confirm();
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Não foi possível verificar a senha.");
      input.current?.focus();
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <Modal titleId="values-privacy-title" busy={busy} close={close} compact>
    <header><h2 id="values-privacy-title">{action}</h2><button type="button" onClick={close} disabled={busy} aria-label="Fechar"><X size={20} /></button></header>
    <form onSubmit={submit}>
      <p className="form-help">A pagar e A receber</p>
      <label className="full">Senha de privacidade<input ref={input} data-initial-focus name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" aria-invalid={!!error} aria-describedby={error ? "values-privacy-error" : undefined} required /></label>
      {error && <p id="values-privacy-error" className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="secondary" onClick={close} disabled={busy}>Cancelar</button><button type="submit" className="primary" disabled={busy}><LockKeyhole size={16} />{busy ? "Verificando…" : hide ? "Ocultar" : "Mostrar"}</button></footer>
    </form>
  </Modal>;
}

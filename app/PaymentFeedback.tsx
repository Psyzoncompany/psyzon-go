"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX, X } from "lucide-react";
import { paymentFeedbackEvent, paymentPreferenceEvent, paymentPreferences, savePaymentPreferences, type PaymentSuccess } from "./payment-feedback";
import "./payment-feedback.css";

export default function PaymentFeedback({ uid }: { uid: string }) {
  const [success, setSuccess] = useState<PaymentSuccess | null>(null);
  const [preferences, setPreferences] = useState(() => paymentPreferences(uid));
  useEffect(() => {
    const update = () => setPreferences(paymentPreferences(uid));
    const receive = (event: Event) => { const value = (event as CustomEvent<PaymentSuccess>).detail; if (value.uid === uid) { update(); setSuccess(value); } };
    window.addEventListener(paymentFeedbackEvent, receive);
    window.addEventListener(paymentPreferenceEvent, update);
    return () => { window.removeEventListener(paymentFeedbackEvent, receive); window.removeEventListener(paymentPreferenceEvent, update); };
  }, [uid]);
  useEffect(() => { if (!success) return; const timer = window.setTimeout(() => setSuccess(null), success.kind==="tick"?1700:2600); return () => window.clearTimeout(timer); }, [success]);
  if (!success) return null;
  return createPortal(<div key={success.id} className="payment-success" data-kind={success.kind??"payment"} data-animated={preferences.animation}>
    <span className="payment-success-mark" aria-hidden="true"><span className="payment-success-halo" />
      <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" /><path d="m19 33 9 9 18-20" /></svg>
      <span className="payment-success-particles">{Array.from({length:8},(_,index) => <i key={index} style={{ transform: `rotate(${index * 45}deg)` }} />)}</span>
    </span>
    <div className="payment-success-copy" role="status" aria-live="polite"><b>{success.title}</b>{success.amount!==undefined && <strong>{success.amount.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong>}<small>{success.description}</small>{success.progress!==undefined && <span className="completion-progress" role="progressbar" aria-label="Progresso da conclusão" aria-valuemin={0} aria-valuemax={100} aria-valuenow={success.progress}><i style={{"--completion-from":Math.max(0,Math.min(100,success.previousProgress??0))/100,"--completion-to":Math.max(0,Math.min(100,success.progress))/100} as CSSProperties} /></span>}</div>
    <div className="payment-success-controls"><button aria-label={preferences.sound ? "Desativar som de confirmação" : "Ativar som de confirmação"} onClick={() => savePaymentPreferences(uid,{...preferences,sound:!preferences.sound})}>{preferences.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button aria-label="Fechar confirmação" onClick={() => setSuccess(null)}><X size={17} /></button></div>
  </div>,document.body);
}
export function PaymentFeedbackSettings({ uid }: { uid: string }) {
  const [preferences, setPreferences] = useState(() => paymentPreferences(uid));
  useEffect(() => { const update=() => setPreferences(paymentPreferences(uid)); window.addEventListener(paymentPreferenceEvent,update); return () => window.removeEventListener(paymentPreferenceEvent,update); },[uid]);
  const change = (key: "sound" | "animation", checked: boolean) => { const next={...preferences,[key]:checked}; setPreferences(next); savePaymentPreferences(uid,next); };
  return <section className="panel payment-feedback-settings"><h2>Feedback de conclusão</h2><label><span>Som de confirmação</span><input type="checkbox" checked={preferences.sound} onChange={event => change("sound",event.target.checked)} /></label><label><span>Animações de conclusão</span><input type="checkbox" checked={preferences.animation} onChange={event => change("animation",event.target.checked)} /></label></section>;
}

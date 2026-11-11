"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, CheckCheck, ListChecks } from "lucide-react";
import { millis } from "../notes-model";
import type { Task } from "./task-model";

const styles = `
  * { box-sizing: border-box; }
  html, body { margin: 0; min-width: 180px; height: 100%; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .ft-panel { --bg: #f5f5f7; --card: #fff; --text: #24212a; --muted: #706a7b; --line: #edeaf2; --accent: #7144c6; min-height: 100%; padding: 16px; background: var(--bg); color: var(--text); }
  .ft-panel[data-dark="true"] { --bg: #16151a; --card: #232129; --text: #f7f4fc; --muted: #b7afc3; --line: #38313f; --accent: #c5a7ff; color-scheme: dark; }
  .ft-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .ft-symbol { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; background: color-mix(in srgb, var(--accent) 12%, var(--card)); color: var(--accent); border-radius: 12px; }
  h1 { margin: 0; font-size: 18px; letter-spacing: -.03em; }
  .ft-header p { margin: 3px 0 0; color: var(--muted); font-size: 11px; }
  button { font: inherit; cursor: pointer; }
  .ft-open { display: grid; place-items: center; flex-shrink: 0; width: 36px; height: 36px; margin-left: auto; border: 0; border-radius: 10px; background: var(--card); color: var(--accent); }
  ul { list-style: none; padding: 0 12px; margin: 0; background: var(--card); border-radius: 16px; }
  li + li { border-top: 1px solid var(--line); }
  label { display: flex; align-items: flex-start; gap: 10px; min-height: 48px; padding: 13px 0; cursor: pointer; }
  input { width: 19px; height: 19px; flex: 0 0 19px; margin: 1px 0 0; accent-color: var(--accent); }
  label span { font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
  .ft-done span { color: var(--muted); text-decoration: line-through; }
  details { margin-top: 14px; }
  summary { min-height: 36px; padding-block: 8px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .ft-message { padding: 12px; margin: 0 0 12px; color: var(--muted); background: var(--card); border-radius: 12px; font-size: 12px; line-height: 1.5; }
  .ft-empty { display: grid; justify-items: center; gap: 8px; padding: 24px 12px; background: var(--card); border-radius: 16px; color: var(--muted); font-size: 13px; text-align: center; }
  .ft-empty p { margin: 0; }
  .ft-error { color: #c33349; }
  button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  input:disabled { opacity: .5; cursor: wait; }
`;

export default function FloatingTasks({ host, tasks, customers, connection, dark, onToggle, openTasks }: {
  host: Window;
  tasks: Task[];
  customers: { id: string; name: string }[];
  connection: "connecting" | "live" | "error";
  dark: boolean;
  onToggle: (id: string, completed: boolean) => Promise<void>;
  openTasks: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  const pending = tasks.filter(task => !task.completed).sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
  const completed = tasks.filter(task => task.completed).sort((a, b) => millis(b.completedAt) - millis(a.completedAt));
  const ready = connection === "live";

  async function toggle(task: Task) {
    if (working.current || !ready) return;
    working.current = true;
    setBusy(true);
    setError("");
    try { await onToggle(task.id, !task.completed); }
    catch { setError("Não foi possível salvar. Confira a conexão e tente novamente."); }
    finally { working.current = false; setBusy(false); }
  }

  return createPortal(<><style>{styles}</style><section className="ft-panel" data-dark={dark} aria-label="Afazeres flutuantes">
    <header className="ft-header"><span className="ft-symbol"><ListChecks size={21} /></span><div><h1>Afazeres</h1><p aria-live="polite">{pending.length} {pending.length === 1 ? "pendente" : "pendentes"} · PSYZON GO</p></div><button type="button" className="ft-open" aria-label="Abrir todos os afazeres" title="Abrir todos os afazeres" onClick={openTasks}><ArrowUpRight size={19} /></button></header>
    {!ready && <p className="ft-message" role="status">{connection === "error" ? "Não foi possível sincronizar os afazeres. Atualize a página do sistema." : "Sincronizando afazeres…"}</p>}
    {error && <p className="ft-message ft-error" role="alert">{error}</p>}
    {pending.length > 0 ? <FloatingTaskRows customers={customers} items={pending} disabled={!ready || busy} onToggle={toggle} /> : ready && <div className="ft-empty"><CheckCheck size={24} /><p>{completed.length ? "Tudo em dia!" : "Nenhum afazer cadastrado."}</p></div>}
    {completed.length > 0 && <details><summary>Concluídos · {completed.length}</summary><FloatingTaskRows customers={customers} items={completed} disabled={!ready || busy} onToggle={toggle} /></details>}
  </section></>, host.document.body);
}

function FloatingTaskRows({ items, customers, disabled, onToggle }: { items: Task[]; customers: { id: string; name: string }[]; disabled: boolean; onToggle: (task: Task) => Promise<void> }) {
  return <ul>{items.map(task => <li key={task.id}>
    <label className={task.completed ? "ft-done" : undefined}><input type="checkbox" checked={task.completed} disabled={disabled} aria-label={`${task.completed ? "Reabrir" : "Concluir"} ${task.title}`} onChange={() => void onToggle(task)} /><span>{task.title}{task.customerId && <small style={{display:"block",opacity:.75}}>{customers.find(customer => customer.id === task.customerId)?.name ?? "Cliente indisponível"}</small>}</span></label>
  </li>)}</ul>;
}

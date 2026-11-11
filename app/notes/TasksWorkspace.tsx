"use client";
import { CountUp, ProgressBar } from "../MotionValue";

import { ArrowLeft, Check, CircleCheck, ListChecks, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { millis } from "../notes-model";
import NoteDialog from "./NoteDialog";
import type { Customer } from "../finance-model";
import type { Task } from "./task-model";
import "./notes.css";
import "./tasks.css";

type Props = {
  tasks: Task[];
  customers: Customer[];
  connection: "connecting" | "live" | "error";
  today: string;
  back: () => void;
  onSave: (title: string, id?: string, customerId?: string) => Promise<void>;
  onToggle: (id: string, completed: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export default function TasksWorkspace({ tasks, customers, connection, today, back, onSave, onToggle, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<string>();
  const [pendingAction, setPendingAction] = useState("");
  const [celebrate, setCelebrate] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean }>();
  const [printOpen, setPrintOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const customerNames = new Map(customers.map(customer => [customer.id, customer.name]));
  const pending = tasks.filter(task => !task.completed).sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
  const completed = tasks.filter(task => task.completed).sort((a, b) => millis(b.completedAt) - millis(a.completedAt));
  const ready = connection === "live";
  const disabled = !ready || !!pendingAction;
  const percent = tasks.length ? Math.round(100 * completed.length / tasks.length) : 0;

  async function run(actionId: string, action: () => Promise<void>, message: string) {
    if (disabled) return;
    setPendingAction(actionId);
    setFeedback(undefined);
    try { await action(); setFeedback({ message }); }
    catch { setFeedback({ message: "Não foi possível salvar a alteração. Confira a conexão e tente de novo.", error: true }); }
    finally { setPendingAction(""); }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    const form = event.currentTarget;
    const customerId = String(new FormData(form).get("customerId") ?? "");
    if (!value) return;
    void run("new", async () => {
      await onSave(value, undefined, customerId);
      form.reset();
      setTitle(current => current.trim() === value ? "" : current);
      input.current?.focus();
    }, "Tarefa adicionada.");
  }

  function edit(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = String(form.get("title") ?? "").trim();
    if (!value) return;
    void run(task.id, async () => {
      await onSave(value, task.id, String(form.get("customerId") ?? ""));
      setEditing(undefined);
    }, "Tarefa atualizada.");
  }

  function renderTask(task: Task) {
    return <li key={task.id} className="task-row" data-celebrate={task.completed && celebrate === task.id ? true : undefined}>
      <label className="task-check">
        <input type="checkbox" checked={task.completed} disabled={disabled} aria-label={`${task.completed ? "Reabrir" : "Concluir"} ${task.title}`} onChange={() => void run(task.id, async () => {
          await onToggle(task.id, !task.completed);
          setCelebrate(task.completed ? "" : task.id);
        }, task.completed ? "Tarefa reaberta." : "Tarefa concluída.")} />
        <Check size={14} aria-hidden="true" />
      </label>
      {editing === task.id ? <form className="task-inline-edit" onSubmit={event => edit(event, task)}>
        <input name="title" aria-label="Editar nome da tarefa" defaultValue={task.title} maxLength={200} required ref={node => node?.focus()} onKeyDown={event => { if (event.key === "Escape") setEditing(undefined); }} />
        <TaskCustomerSelect customers={customers} selected={task.customerId} />
        <button type="submit" aria-label="Salvar tarefa" disabled={disabled}><Check size={17} /></button>
        <button type="button" aria-label="Cancelar edição" disabled={disabled} onClick={() => setEditing(undefined)}><X size={17} /></button>
      </form> : <>
        <span className={task.completed ? "task-title done" : "task-title"}>{task.title}{task.customerId && <small className="task-customer-name">{customerNames.get(task.customerId) ?? "Cliente indisponível"}</small>}</span>
        <div className="task-actions">
          <button type="button" aria-label={`Editar ${task.title}`} title="Editar" disabled={disabled} onClick={() => setEditing(task.id)}><Pencil size={16} /></button>
          <button type="button" aria-label={`Excluir ${task.title}`} title="Excluir" disabled={disabled} onClick={() => {
            if (window.confirm(`Excluir “${task.title}” da lista?`)) void run(task.id, () => onDelete(task.id), "Tarefa excluída.");
          }}><Trash2 size={16} /></button>
        </div>
      </>}
    </li>;
  }

  return <section className="tasks-workspace">
    <button type="button" className="tasks-back" onClick={back}><ArrowLeft size={17} /> Bloco de notas</button>
    <header className="tasks-heading">
      <div><span className="eyebrow">BLOCO DE NOTAS</span><h1>Afazeres</h1><p>Anote, marque e acompanhe suas tarefas do dia a dia.</p></div>
      <button type="button" className="secondary" disabled={!tasks.length} onClick={() => setPrintOpen(true)}><Printer size={17} /> PDF / Imprimir</button>
    </header>
    <section className="tasks-board panel" aria-label="Lista de afazeres">
      <div className="tasks-progress">
        <span className="tasks-progress-icon"><ListChecks size={21} /></span>
        <div><strong>{completed.length} de {tasks.length} {tasks.length === 1 ? "tarefa concluída" : "tarefas concluídas"}</strong><ProgressBar value={percent} label="Progresso dos afazeres" /></div>
        <b><CountUp value={percent} />%</b>
      </div>
      <form className="tasks-add" onSubmit={add}>
        <input ref={input} value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required aria-label="Nova tarefa" placeholder="O que você precisa fazer?" />
        <TaskCustomerSelect customers={customers} />
        <button type="submit" className="primary" disabled={disabled || !title.trim()}><Plus size={18} /> {pendingAction === "new" ? "Salvando…" : "Adicionar"}</button>
      </form>
      {!ready && <p className="tasks-feedback" role="status">{connection === "error" ? "A lista não sincronizou. Confira a conexão e recarregue a página." : "Sincronizando afazeres…"}</p>}
      {feedback && <p className={feedback.error ? "form-error tasks-feedback" : "tasks-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
      <div className="tasks-list">
        <h2>Pendentes <span>{pending.length}</span></h2>
        {pending.length ? <ul>{pending.map(renderTask)}</ul> : <div className="tasks-empty"><CircleCheck size={23} /><p>{tasks.length ? "Tudo em dia. Todas as tarefas foram concluídas." : "Adicione sua primeira tarefa acima."}</p></div>}
      </div>
      {completed.length > 0 && <div className="tasks-list">
        <h2>Concluídas <span>{completed.length}</span></h2>
        <ul>{completed.map(renderTask)}</ul>
      </div>}
    </section>
    {printOpen && <TasksPrint customerNames={customerNames} pending={pending} completed={completed} today={today} close={() => setPrintOpen(false)} />}
  </section>;
}

function TaskCustomerSelect({ customers, selected }: { customers: Customer[]; selected?: string }) {
  const options = customers.filter(customer => !customer.archived || customer.id === selected).sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
  return <select className="task-customer-select" aria-label="Cliente (opcional)" name="customerId" defaultValue={selected ?? ""}><option value="">Sem cliente</option>{selected && !options.some(customer => customer.id === selected) && <option value={selected}>Cliente indisponível</option>}{options.map(customer => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select>;
}

function TasksPrint({ pending, completed, today, close, customerNames }: { customerNames: Map<string,string>; pending: Task[]; completed: Task[]; today: string; close: () => void }) {
  const [includeDone, setIncludeDone] = useState(!pending.length);
  const selected = includeDone ? [...pending, ...completed] : pending;
  const issued = today.split("-").reverse().join("/");
  return <NoteDialog title="Imprimir afazeres" close={close}>
    <div className="tasks-print-options">
      <p>Checklist A4 com quadrados para marcar. Na janela de impressão, escolha uma impressora ou <strong>Salvar como PDF</strong>.</p>
      {!!completed.length && <label><input type="checkbox" checked={includeDone} onChange={event => setIncludeDone(event.target.checked)} /> Incluir tarefas concluídas</label>}
      <span>{selected.length} {selected.length === 1 ? "tarefa na folha" : "tarefas na lista"}</span>
    </div>
    <footer className="an-export-actions"><button type="button" onClick={close}>Cancelar</button><button type="button" className="an-primary" disabled={!selected.length} onClick={() => window.print()}><Printer size={16} /> PDF / Imprimir</button></footer>
    {createPortal(<article className="tasks-print-root" aria-hidden="true">
      <header>
        <div><small>PSYZON GO · BLOCO DE NOTAS</small><h1>Lista de afazeres</h1><p>Checklist de acompanhamento · {issued}</p></div>
        <div className="tasks-print-count"><strong>{selected.length}</strong><small>{selected.length === 1 ? "TAREFA" : "TAREFAS"}</small></div>
      </header>
      <table>
        <thead><tr><th scope="col">Nº</th><th scope="col">Feito</th><th scope="col">Tarefa</th></tr></thead>
        <tbody>{selected.map((task, index) => <tr key={task.id}><td>{String(index + 1).padStart(2, "0")}</td><td><span className="tasks-print-check">{task.completed && <Check size={13} />}</span></td><td>{task.title}{task.customerId && <small className="task-customer-name">{customerNames.get(task.customerId) ?? "Cliente indisponível"}</small>}</td></tr>)}</tbody>
      </table>
      <footer><span>Pendentes {pending.length}{includeDone ? ` · Concluídas ${completed.length}` : ""}</span><span>Formato A4</span></footer>
    </article>, document.body)}
  </NoteDialog>;
}

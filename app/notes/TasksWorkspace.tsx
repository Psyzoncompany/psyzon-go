"use client";

import { ArrowLeft, Check, CircleCheck, ListChecks, PackagePlus, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { millis } from "../notes-model";
import NoteDialog from "./NoteDialog";
import type { Task } from "./task-model";
import "./notes.css";
import "./tasks.css";

type TaskListProps = {
  stock?: boolean;
  tasks: Task[];
  connection: "connecting" | "live" | "error";
  today: string;
  back: () => void;
  onSave: (title: string, id?: string) => Promise<void>;
  onToggle: (id: string, completed: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type Props = TaskListProps & {
  restock: Task[];
  stockConnection: TaskListProps["connection"];
  onRestockSave: TaskListProps["onSave"];
  onRestockToggle: TaskListProps["onToggle"];
  onRestockDelete: TaskListProps["onDelete"];
};

export default function TasksWorkspace(props: Props) {
  const [tab, setTab] = useState<"tasks" | "stock">("tasks");
  return <section className="tasks-workspace">
    <button type="button" className="tasks-back" onClick={props.back}><ArrowLeft size={17} /> Bloco de notas</button>
    <nav className="tasks-tabs" aria-label="Listas de afazeres">
      <button type="button" aria-pressed={tab === "tasks"} onClick={() => setTab("tasks")}><ListChecks size={17} /> Afazeres</button>
      <button type="button" aria-pressed={tab === "stock"} onClick={() => setTab("stock")}><PackagePlus size={17} /> Reposição de estoque <span>{props.restock.filter(item => !item.completed).length}</span></button>
    </nav>
    <div hidden={tab !== "tasks"}><TaskList {...props} /></div>
    <div hidden={tab !== "stock"}><TaskList {...props} stock tasks={props.restock} connection={props.stockConnection} onSave={props.onRestockSave} onToggle={props.onRestockToggle} onDelete={props.onRestockDelete} /></div>
  </section>;
}

function TaskList({ tasks, connection, today, onSave, onToggle, onDelete, stock = false }: TaskListProps) {
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<string>();
  const [pendingAction, setPendingAction] = useState("");
  const [celebrate, setCelebrate] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean }>();
  const [printOpen, setPrintOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
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
    if (!value) return;
    void run("new", async () => {
      await onSave(value);
      setTitle(current => current.trim() === value ? "" : current);
      input.current?.focus();
    }, stock ? "Item adicionado à reposição." : "Tarefa adicionada.");
  }

  function edit(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (!value) return;
    void run(task.id, async () => {
      await onSave(value, task.id);
      setEditing(undefined);
    }, stock ? "Item atualizado." : "Tarefa atualizada.");
  }

  function renderTask(task: Task) {
    return <li key={task.id} className="task-row" data-celebrate={task.completed && celebrate === task.id ? true : undefined}>
      <label className="task-check">
        <input type="checkbox" checked={task.completed} disabled={disabled} aria-label={`${task.completed ? "Reabrir" : stock ? "Marcar como reposto:" : "Concluir"} ${task.title}`} onChange={() => void run(task.id, async () => {
          await onToggle(task.id, !task.completed);
          setCelebrate(task.completed ? "" : task.id);
        }, stock ? task.completed ? "Item reaberto para reposição." : "Item reposto." : task.completed ? "Tarefa reaberta." : "Tarefa concluída.")} />
        <Check size={14} aria-hidden="true" />
      </label>
      {editing === task.id ? <form className="task-inline-edit" onSubmit={event => edit(event, task)}>
        <textarea name="title" aria-label={stock ? "Editar item de reposição" : "Editar nome da tarefa"} defaultValue={task.title} maxLength={stock ? 2000 : 200} rows={stock ? 3 : 1} required ref={node => node?.focus()} onKeyDown={event => { if (event.key === "Escape") setEditing(undefined); }} />
        <button type="submit" aria-label={stock ? "Salvar item de reposição" : "Salvar tarefa"} disabled={disabled}><Check size={17} /></button>
        <button type="button" aria-label="Cancelar edição" disabled={disabled} onClick={() => setEditing(undefined)}><X size={17} /></button>
      </form> : <>
        <span className={task.completed ? "task-title done" : "task-title"}>{task.title}</span>
        <div className="task-actions">
          <button type="button" aria-label={`Editar ${task.title}`} title="Editar" disabled={disabled} onClick={() => setEditing(task.id)}><Pencil size={16} /></button>
          <button type="button" aria-label={`Excluir ${task.title}`} title="Excluir" disabled={disabled} onClick={() => {
            if (window.confirm(`Excluir “${task.title}” da lista?`)) void run(task.id, () => onDelete(task.id), stock ? "Item removido da reposição." : "Tarefa excluída.");
          }}><Trash2 size={16} /></button>
        </div>
      </>}
    </li>;
  }

  return <section className="tasks-workspace">
    <header className="tasks-heading">
      <div><span className="eyebrow">BLOCO DE NOTAS</span><h1>{stock ? "Reposição de estoque" : "Afazeres"}</h1><p>{stock ? "Anote materiais, quantidades e observações para a próxima compra." : "Anote, marque e acompanhe suas tarefas do dia a dia."}</p></div>
      <button type="button" className="secondary" disabled={!tasks.length} onClick={() => setPrintOpen(true)}><Printer size={17} /> PDF / Imprimir</button>
    </header>
    <section className="tasks-board panel" aria-label={stock ? "Lista de reposição de estoque" : "Lista de afazeres"}>
      <div className="tasks-progress">
        <span className="tasks-progress-icon">{stock ? <PackagePlus size={21} /> : <ListChecks size={21} />}</span>
        <div><strong>{completed.length} de {tasks.length} {stock ? tasks.length === 1 ? "item reposto" : "itens repostos" : tasks.length === 1 ? "tarefa concluída" : "tarefas concluídas"}</strong><progress value={percent} max={100} aria-label={stock ? "Progresso da reposição de estoque" : "Progresso dos afazeres"} /></div>
        <b>{percent}%</b>
      </div>
      <form className="tasks-add" onSubmit={add}>
        <textarea ref={input} onKeyDown={event => { if (!stock && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} value={title} onChange={event => setTitle(event.target.value)} maxLength={stock ? 2000 : 200} rows={stock ? 3 : 1} required aria-label={stock ? "Novo item de reposição" : "Nova tarefa"} placeholder={stock ? "Ex.: Malha PV preta — 5 kg\nFornecedor, prazo ou outras observações…" : "O que você precisa fazer?"} />
        <button type="submit" className="primary" disabled={disabled || !title.trim()}><Plus size={18} /> {pendingAction === "new" ? "Salvando…" : "Adicionar"}</button>
      </form>
      {!ready && <p className="tasks-feedback" role="status">{connection === "error" ? "A lista não sincronizou. Confira a conexão e recarregue a página." : stock ? "Sincronizando reposição de estoque…" : "Sincronizando afazeres…"}</p>}
      {feedback && <p className={feedback.error ? "form-error tasks-feedback" : "tasks-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
      <div className="tasks-list">
        <h2>{stock ? "A repor" : "Pendentes"} <span>{pending.length}</span></h2>
        {pending.length ? <ul>{pending.map(renderTask)}</ul> : <div className="tasks-empty"><CircleCheck size={23} /><p>{stock ? tasks.length ? "Estoque em dia. Todos os itens foram repostos." : "Anote acima o primeiro item que precisa repor." : tasks.length ? "Tudo em dia. Todas as tarefas foram concluídas." : "Adicione sua primeira tarefa acima."}</p></div>}
      </div>
      {completed.length > 0 && <div className="tasks-list">
        <h2>{stock ? "Repostos" : "Concluídas"} <span>{completed.length}</span></h2>
        <ul>{completed.map(renderTask)}</ul>
      </div>}
    </section>
    {printOpen && <TasksPrint stock={stock} pending={pending} completed={completed} today={today} close={() => setPrintOpen(false)} />}
  </section>;
}

function TasksPrint({ pending, completed, today, close, stock }: { stock?: boolean; pending: Task[]; completed: Task[]; today: string; close: () => void }) {
  const [includeDone, setIncludeDone] = useState(!pending.length);
  const selected = includeDone ? [...pending, ...completed] : pending;
  const issued = today.split("-").reverse().join("/");
  return <NoteDialog title={stock ? "Imprimir reposição de estoque" : "Imprimir afazeres"} close={close}>
    <div className="tasks-print-options">
      <p>Checklist A4 com quadrados para marcar. Na janela de impressão, escolha uma impressora ou <strong>Salvar como PDF</strong>.</p>
      {!!completed.length && <label><input type="checkbox" checked={includeDone} onChange={event => setIncludeDone(event.target.checked)} /> {stock ? "Incluir itens repostos" : "Incluir tarefas concluídas"}</label>}
      <span>{selected.length} {stock ? selected.length === 1 ? "item na folha" : "itens na lista" : selected.length === 1 ? "tarefa na folha" : "tarefas na lista"}</span>
    </div>
    <footer className="an-export-actions"><button type="button" onClick={close}>Cancelar</button><button type="button" className="an-primary" disabled={!selected.length} onClick={() => window.print()}><Printer size={16} /> PDF / Imprimir</button></footer>
    {createPortal(<article className="tasks-print-root" aria-hidden="true">
      <header>
        <div><small>PSYZON GO · BLOCO DE NOTAS</small><h1>{stock ? "Reposição de estoque" : "Lista de afazeres"}</h1><p>Checklist de acompanhamento · {issued}</p></div>
        <div className="tasks-print-count"><strong>{selected.length}</strong><small>{stock ? selected.length === 1 ? "ITEM" : "ITENS" : selected.length === 1 ? "TAREFA" : "TAREFAS"}</small></div>
      </header>
      <table>
        <thead><tr><th scope="col">Nº</th><th scope="col">{stock ? "Reposto" : "Feito"}</th><th scope="col">{stock ? "Item / quantidade / observações" : "Tarefa"}</th></tr></thead>
        <tbody>{selected.map((task, index) => <tr key={task.id}><td>{String(index + 1).padStart(2, "0")}</td><td><span className="tasks-print-check">{task.completed && <Check size={13} />}</span></td><td>{task.title}</td></tr>)}</tbody>
      </table>
      <footer><span>{stock ? "A repor" : "Pendentes"} {pending.length}{includeDone ? ` · ${stock ? "Repostos" : "Concluídas"} ${completed.length}` : ""}</span><span>Formato A4</span></footer>
    </article>, document.body)}
  </NoteDialog>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { getApps } from "firebase/app";
import { getFirestore, waitForPendingWrites } from "firebase/firestore";
import { ArchiveRestore, CalendarClock, Download, HardDriveDownload, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { BackupInfo, BackupStatus, RestorePreview } from "./backup-types";
import { prepareReloadEvent, type PrepareReload } from "./update-events";
import Modal from "./Modal";
import { readFinanceIntents } from "./offline-finance";
import "./backups.css";

const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(value));
const kind = { weekly: "Semanal", manual: "Manual", "before-restore": "Antes da recuperação" };
const bytes = (value: number) => value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

async function flushEdits(uid: string) {
  if (readFinanceIntents(uid).length) throw new Error("Resolva os pagamentos pendentes de sincronização antes de criar ou recuperar uma cópia.");
  const saves: Promise<boolean>[] = [];
  window.dispatchEvent(new CustomEvent<PrepareReload>(prepareReloadEvent, { detail: { waitUntil: promise => saves.push(promise) } }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ready = await Promise.race([
      Promise.all([Promise.all(saves).then(values => values.every(Boolean)), waitForPendingWrites(getFirestore(getApps()[0])).then(() => true)]).then(values => values.every(Boolean)),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 15_000); }),
    ]);
    if (!ready) throw new Error("Aguarde a sincronização das alterações antes de recuperar uma cópia.");
  } finally { clearTimeout(timer); }
}

export default function BackupSettings({ user }: { user: User | null }) {
  const [status, setStatus] = useState<BackupStatus>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<RestorePreview>();
  const [confirmed, setConfirmed] = useState(false);
  const revision = useRef(0);
  const accountId = user?.uid;
  const invalidate = useCallback(() => { revision.current++; }, []);
  const call = useCallback(async (body?: unknown, query = "") => {
    if (!user || !navigator.onLine) throw new Error("Conecte-se à internet para acessar as cópias da sua conta.");
    const response = await fetch("/api/backups" + query, {
      method: body ? "POST" : "GET", cache: "no-store",
      headers: { authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error || "Não foi possível acessar os backups."); }
    return response;
  }, [user]);
  const load = useCallback(async () => {
    const ticket = ++revision.current;
    try { const data = await (await call()).json() as BackupStatus; if (ticket === revision.current) { setStatus(data); setError(""); } }
    catch (cause) { if (ticket === revision.current) setError(cause instanceof Error ? cause.message : "Falha ao carregar os backups."); }
  }, [call]);
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed && accountId) void load(); });
    return () => { disposed = true; invalidate(); };
  }, [accountId, load, invalidate]);
  useEffect(() => {
    const online = () => { void load(); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [load]);
  useEffect(() => {
    if (!status?.working) return;
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [status?.working, load]);

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError(""); setMessage("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir."); }
    finally { setBusy(""); }
  }
  async function download(info: BackupInfo) {
    const response = await call(undefined, "?download=" + encodeURIComponent(info.id));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = `psyzon-backup-${info.createdAt.slice(0, 10)}.json.gz`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  if (!user) return null;
  const last = status?.backups[0];
  const disabled = Boolean(busy || status?.working);
  return <section className="panel backup-settings" aria-labelledby="backup-title" aria-busy={Boolean(busy)}>
    <header><span className="backup-icon"><ShieldCheck size={23} /></span><div><h2 id="backup-title">Backup e recuperação</h2><p>{status ? status.enabled ? "Automático · toda semana" : "Agendamento indisponível" : error ? "Consulta indisponível" : "Consultando cópias…"}</p></div><button type="button" className="secondary" aria-label="Atualizar backups" disabled={disabled} onClick={() => void run("refresh", load)}><RefreshCw size={17} /></button></header>
    <div className="backup-overview">
      <div><span>Última cópia conferida</span><strong>{last ? date(last.verifiedAt) : status ? "Nenhuma cópia ainda" : "Carregando…"}</strong><small>{last ? `${last.documents} registros · ${bytes(last.bytes)}` : ""}</small></div>
      <div><span><CalendarClock size={15} /> Próxima cópia</span><strong>{status ? date(status.nextRun) : "—"}</strong><small>Domingo, 03h · Bahia</small></div>
    </div>
    <div className="backup-actions"><button type="button" className="primary" disabled={disabled} onClick={() => void run("create", async () => { await flushEdits(user.uid); await call({ action: "create" }); await load(); setMessage("Cópia criada e integridade conferida."); })}><HardDriveDownload size={17} />{busy === "create" ? "Criando cópia…" : "Gerar cópia agora"}</button>{last && <button type="button" className="secondary" disabled={disabled} onClick={() => void run("download", () => download(last))}><Download size={17} /> Baixar última cópia</button>}</div>
    {status?.working && <p className="backup-message" role="status">Há uma operação em andamento. A lista será atualizada ao concluir.</p>}
    {(error || status?.lastError) && <p className="form-error" role="alert">{error || status?.lastError}</p>}
    {message && <p className="backup-message" role="status">{message}</p>}
    {!!status?.backups.length && <details className="backup-history"><summary>Cópias disponíveis <span>{status.backups.length}</span></summary><ul>{status.backups.map(info => <li key={info.id}><span><b>{date(info.createdAt)}</b><small>{kind[info.kind]} · {info.documents} registros · {bytes(info.bytes)}</small></span><div><button type="button" className="secondary" disabled={disabled} aria-label={`Baixar cópia de ${date(info.createdAt)}`} onClick={() => void run("download", () => download(info))}><Download size={16} /></button><button type="button" className="secondary" disabled={disabled} onClick={() => void run("preview", async () => { await flushEdits(user.uid); const data = await (await call({ action: "preview", id: info.id })).json() as RestorePreview; setConfirmed(false); setPreview(data); })}><ArchiveRestore size={16} /> Recuperar</button></div></li>)}</ul></details>}
    {preview && <Modal titleId="backup-recover-title" busy={Boolean(busy)} compact close={() => { if (!busy) setPreview(undefined); }}>
      <header><h2 id="backup-recover-title">Conferir recuperação</h2><button type="button" aria-label="Fechar recuperação" disabled={Boolean(busy)} onClick={() => setPreview(undefined)}><X size={20} /></button></header>
      <div className="backup-recovery"><strong>Cópia de {date(preview.backup.createdAt)}</strong><dl><div><dt>Registros que voltam</dt><dd>{preview.added}</dd></div><div><dt>Versões que serão substituídas</dt><dd>{preview.changed}</dd></div><div><dt>Registros posteriores que sairão</dt><dd>{preview.removed}</dd></div><div><dt>Sem alteração</dt><dd>{preview.unchanged}</dd></div></dl>
        <p>As alterações posteriores a esta cópia serão desfeitas. Antes, uma cópia dos dados atuais será guardada. Feche o site nos outros aparelhos durante a recuperação.</p>
        <label><input type="checkbox" checked={confirmed} disabled={Boolean(busy)} onChange={event => setConfirmed(event.target.checked)} />Quero recuperar os dados desta conta para essa versão.</label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setPreview(undefined)}>Cancelar</button><button type="button" className="primary" disabled={!confirmed || Boolean(busy)} onClick={() => void run("restore", async () => { await flushEdits(user.uid); await call({ action: "restore", token: preview.token, confirmed: true }); window.location.reload(); })}>{busy === "restore" ? "Recuperando…" : "Recuperar esta cópia"}</button></footer>
      </div>
    </Modal>}
  </section>;
}

"use client";

import { Download, Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { decryptVault, deriveVaultKey, encryptVault, maxVaultSize, newVaultSalt, parseVault, searchVault, vaultCategories, vaultKey, type VaultEntry } from "./vault-model";
import "./vault.css";

type Session = { key: CryptoKey; salt: string; serialized: string; entries: VaultEntry[] };
const lockAfterMs = 3 * 60 * 1000;

export default function VaultWorkspace({ uid }: { uid: string }) {
  const storageKey = vaultKey(uid);
  const revision = useRef(0);
  const working = useRef(false);
  const inputFile = useRef<HTMLInputElement>(null);
  const [stored, setStored] = useState<string | null>();
  const [backup, setBackup] = useState<string>();
  const [session, setSession] = useState<Session>();
  const [lockEpoch, setLockEpoch] = useState(0);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<VaultEntry["category"] | "Todas">("Todas");
  const [revealed, setRevealed] = useState("");
  const [editor, setEditor] = useState<VaultEntry | "new">();

  function lock() {
    revision.current++;
    setLockEpoch(epoch => epoch + 1);
    setCapsLock(false);
    setSession(undefined);
    setEditor(undefined);
    setRevealed("");
    setQuery("");
    setNotice("");
  }

  useEffect(() => {
    function refresh() {
      try { setStored(localStorage.getItem(storageKey)); }
      catch { setNotice("O navegador bloqueou o armazenamento local."); }
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey && event.key !== null) return;
      lock();
      setBackup(undefined);
      refresh();
    }
    refresh();
    window.addEventListener("storage", onStorage);
    return () => { revision.current++; window.removeEventListener("storage", onStorage); };
  }, [storageKey]);

  const unlocked = Boolean(session);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const touch = () => { clearTimeout(timer); if (unlocked) timer = setTimeout(lock, lockAfterMs); };
    const onVisibility = () => { if (document.hidden) lock(); };
    touch();
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", lock);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", lock);
    };
  }, [unlocked]);

  function persist(expected: string | null, next: string, ticket: number) {
    const write = () => {
      if (revision.current !== ticket || document.hidden) throw new Error("O cofre foi bloqueado.");
      if (localStorage.getItem(storageKey) !== expected) throw new Error("O cofre mudou em outra aba. Abra novamente.");
      localStorage.setItem(storageKey, next);
      setStored(next);
    };
    return navigator.locks ? navigator.locks.request(storageKey, write) : Promise.resolve().then(write);
  }

  async function run(action: (ticket: number) => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setNotice("");
    const ticket = revision.current;
    try { await action(ticket); }
    catch (error) { if (ticket === revision.current) setNotice(error instanceof Error ? error.message : "Não foi possível concluir."); }
    finally { working.current = false; setBusy(false); }
  }

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    form.reset();
    if (stored === undefined) return;
    const password = String(fields.get("password") ?? "");
    const source = stored ?? backup;
    void run(async ticket => {
      if (!source && password.trim().length < 6) {
        throw new Error("Use pelo menos 6 caracteres.");
      }
      const payload = source ? parseVault(source) : undefined;
      const salt = payload?.salt ?? newVaultSalt();
      const key = await deriveVaultKey(password, salt);
      const entries = payload ? await decryptVault(payload, key).catch(() => { throw new Error("Senha incorreta ou cópia de segurança inválida."); }) : [];
      const serialized = source ?? await encryptVault(entries, key, salt);
      if (stored === null) await persist(null, serialized, ticket);
      if (revision.current !== ticket || document.hidden) return;
      setBackup(undefined);
      setSession({ key, salt, entries, serialized });
    });
  }

  function saveEntries(entries: VaultEntry[]) {
    if (!session) return;
    void run(async ticket => {
      const serialized = await encryptVault(entries, session.key, session.salt);
      await persist(session.serialized, serialized, ticket);
      if (revision.current !== ticket) return;
      setSession({ ...session, entries, serialized });
      setEditor(undefined);
      setRevealed("");
    });
  }

  function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !editor) return;
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title") ?? "").trim();
    const selected = String(fields.get("category")) as VaultEntry["category"];
    if (!title || !vaultCategories.includes(selected)) { setNotice("Informe o título e a categoria."); return; }
    const entry = { id: editor === "new" ? crypto.randomUUID() : editor.id, title, category: selected,
      login: String(fields.get("login") ?? "").trim(), secret: String(fields.get("secret") ?? "") };
    saveEntries(editor === "new" ? [...session.entries, entry] : session.entries.map(item => item.id === entry.id ? entry : item));
  }

  function exportBackup() {
    if (!session) return;
    const url = URL.createObjectURL(new Blob([session.serialized], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "psyzon-cofre-backup.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const initializing = stored === null && !backup;
  const entries = session ? searchVault(session.entries, query, category) : [];
  const current = editor && editor !== "new" ? editor : undefined;
  return <section className="vault-workspace">
    <header className="vault-heading"><div className="vault-title"><span><KeyRound size={22} aria-hidden="true" /></span><h1>Cofre de senhas</h1></div>
      {session && <div className="vault-actions"><button type="button" className="secondary" onClick={exportBackup}><Download size={16} /> Baixar backup</button><button type="button" className="secondary" onClick={lock}><Lock size={16} /> Bloquear</button></div>}
    </header>
    {notice && <p role="alert" className="form-error">{notice}</p>}
    {!session ? <div className="panel vault-access">
      <h2>{initializing ? "Criar cofre" : backup ? "Restaurar backup" : "Desbloquear cofre"}</h2>
      <p>Dica da senha: <strong>Cachorro</strong></p>
      {stored !== undefined && <form key={lockEpoch} onSubmit={unlock}>
        <label>Senha principal<input type="password" name="password" autoComplete={initializing ? "new-password" : "current-password"} required minLength={initializing ? 6 : undefined} maxLength={512}
          aria-describedby={capsLock ? "vault-caps-lock" : undefined}
          onKeyDown={event => setCapsLock(event.getModifierState("CapsLock"))}
          onKeyUp={event => setCapsLock(event.getModifierState("CapsLock"))}
          onBlur={() => setCapsLock(false)} /></label>
        <span id="vault-caps-lock" role="status" hidden={!capsLock}>Caps Lock ativado</span>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Aguarde…" : initializing ? "Criar cofre" : backup ? "Restaurar cofre" : "Desbloquear"}</button>
      </form>}
      {stored === null && <div className="vault-actions">
        <input type="file" ref={inputFile} accept=".json,application/json" hidden onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void run(async ticket => {
            if (file.size > maxVaultSize) throw new Error("A cópia de segurança é grande demais.");
            const source = await file.text();
            let canonical: string;
            try { canonical = JSON.stringify(parseVault(source)); } catch { throw new Error("Selecione um backup criptografado do Cofre Psyzon GO."); }
            if (revision.current === ticket) setBackup(canonical);
          });
        }} />
        <button type="button" className="secondary" disabled={busy} onClick={() => backup ? setBackup(undefined) : inputFile.current?.click()}>{backup ? "Cancelar restauração" : <><Upload size={16} /> Restaurar backup</>}</button>
      </div>}
    </div> : <>
      <div className="panel vault-toolbar">
        <label className="vault-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Buscar no cofre" placeholder="Buscar por título, usuário ou categoria" value={query} onChange={event => { setRevealed(""); setQuery(event.target.value); }} /></label>
        <select aria-label="Filtrar por categoria" value={category} onChange={event => { setRevealed(""); setCategory(event.target.value as typeof category); }}><option>Todas</option>{vaultCategories.map(item => <option key={item}>{item}</option>)}</select>
        <button type="button" className="primary" disabled={busy} onClick={() => { setRevealed(""); setEditor("new"); }}><Plus size={17} /> Novo registro</button>
      </div>
      {editor && <form className="panel vault-editor" key={current?.id ?? "new"} onSubmit={saveEntry}>
        <h2>{current ? "Editar registro" : "Novo registro"}</h2>
        <label>Título<input name="title" required maxLength={160} defaultValue={current?.title} /></label>
        <label>Categoria<select name="category" defaultValue={current?.category ?? (category === "Todas" ? "Pessoal" : category)}>{vaultCategories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Usuário ou identificação<input name="login" defaultValue={current?.login} maxLength={240} autoComplete="off" spellCheck={false} /></label>
        <label>Senha ou dado protegido<input name="secret" type="password" defaultValue={current?.secret} maxLength={1024} required autoComplete="new-password" /></label>
        <div className="vault-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setEditor(undefined)}>Cancelar</button><button type="submit" className="primary" disabled={busy}>Salvar registro</button></div>
      </form>}
      {entries.length ? <ul className="panel vault-list">{entries.map(item => <li key={item.id}>
        <div className="vault-entry"><strong>{item.title}</strong><small>{item.category}{item.login && ` · ${item.login}`}</small>{revealed === item.id && <output>{item.secret}</output>}</div>
        <div className="vault-actions">
          <button className="secondary" type="button" aria-label={`${revealed === item.id ? "Ocultar" : "Mostrar"} senha de ${item.title}`} onClick={() => setRevealed(revealed === item.id ? "" : item.id)}>{revealed === item.id ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          <button className="secondary" type="button" aria-label={`Editar ${item.title}`} disabled={busy} onClick={() => { setRevealed(""); setEditor(item); }}><Pencil size={17} /></button>
          <button className="secondary" type="button" aria-label={`Excluir ${item.title}`} disabled={busy} onClick={() => { if (window.confirm("Excluir este registro do cofre?")) saveEntries(session.entries.filter(row => row.id !== item.id)); }}><Trash2 size={17} /></button>
        </div>
      </li>)}</ul> : <p className="panel vault-empty">{session.entries.length ? "Nenhum registro com esse filtro." : "Nenhum registro no cofre."}</p>}
    </>}
  </section>;
}

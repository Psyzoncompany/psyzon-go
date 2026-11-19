"use client";

import { Download, Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { getApp } from "firebase/app";
import { doc, getFirestore, onSnapshot, runTransaction, updateDoc } from "firebase/firestore";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Modal from "./Modal";
import { acceptFirestoreWrite } from "./local-firestore-write";
import { decryptVault, deriveVaultKey, encryptVault, maxVaultSize, newVaultSalt, parseVault, searchVault, vaultCategories, vaultKey, type VaultEntry } from "./vault-model";
import "./vault.css";

type Session = { key: CryptoKey; salt: string; serialized: string; entries: VaultEntry[] };
type CloudVault = { encrypted: string; revision: string; previous: string; archiveId: string };
const vaultPages = ["Todas", ...vaultCategories, "Configurações"] as const;
const vaultDocument = (uid: string, id = "main") => doc(getFirestore(getApp()), "users", uid, "privateVault", id);

export default function VaultWorkspace({ uid, active }: { uid: string; active: boolean }) {
  const storageKey = vaultKey(uid);
  const revision = useRef(0);
  const working = useRef(false);
  const inputFile = useRef<HTMLInputElement>(null);
  const cloud = useRef<CloudVault | null | undefined>(undefined);
  const ownWrite = useRef<string>(undefined);
  const legacy = useRef<string | null>(null);
  const [stored, setStored] = useState<string | null>();
  const [opened, setOpened] = useState(active);
  const [synced, setSynced] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [archiveId, setArchiveId] = useState("");
  const [rejectedBackup, setRejectedBackup] = useState<string>();
  const [backup, setBackup] = useState<string>();
  const [session, setSession] = useState<Session>();
  const [lockEpoch, setLockEpoch] = useState(0);
  const [capsLock, setCapsLock] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<typeof vaultPages[number]>("Todas");
  const [revealed, setRevealed] = useState("");
  const [editor, setEditor] = useState<VaultEntry | "new">();
  const [changingPassword, setChangingPassword] = useState(false);
  const [startingNewVault, setStartingNewVault] = useState(false);
  const [previousBackup, setPreviousBackup] = useState<string>();

  function lock() {
    revision.current++;
    setLockEpoch(epoch => epoch + 1);
    setCapsLock(false);
    setShowPassword(false);
    setSession(undefined);
    setEditor(undefined);
    setRevealed("");
    setQuery("");
    setNotice("");
    setChangingPassword(false);
    setStartingNewVault(false);
  }

  const refreshFromOtherTab = useEffectEvent(async (value: string | null) => {
    const ticket = ++revision.current;
    setStored(value);
    setBackup(undefined);
    if (!session) return;
    setRevealed("");
    setEditor(undefined);
    setChangingPassword(false);
    try {
      if (!value) { lock(); return; }
      const payload = parseVault(value);
      if (payload.salt !== session.salt) { lock(); return; }
      const entries = await decryptVault(payload, session.key);
      if (revision.current === ticket) setSession({ ...session, entries, serialized: value });
    } catch {
      if (revision.current === ticket) lock();
    }
  });

  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);

  useEffect(() => {
    if (!opened) return;
    try {
      legacy.current = localStorage.getItem(storageKey);
      const latest = Object.keys(localStorage).filter(key => key.startsWith(`${storageKey}:archive:`)).sort().at(-1);
      if (latest) setPreviousBackup(localStorage.getItem(latest) ?? undefined);
    } catch { /* Older versions used browser storage for their encrypted vault. */ }
    let previousValue: string | null | undefined;
    const unsubscribe = onSnapshot(vaultDocument(uid), { includeMetadataChanges: true }, snapshot => {
      const value = snapshot.exists() ? snapshot.data() as CloudVault : null;
      setPendingSync(snapshot.metadata.hasPendingWrites);
      if (snapshot.metadata.fromCache && !value && cloud.current === undefined && !legacy.current) return;
      cloud.current = value;
      setSynced(!snapshot.metadata.fromCache);
      setArchiveId(value?.archiveId ?? "");
      const next = value?.encrypted ?? legacy.current;
      if (previousValue === next) return;
      previousValue = next;
      if (value?.revision === ownWrite.current && value) setStored(next);
      else void refreshFromOtherTab(next);
    }, () => setNotice("Não foi possível sincronizar o cofre da sua conta."));
    return () => { revision.current++; unsubscribe(); };
  }, [uid, storageKey, opened]);

  useEffect(() => {
    if (!archiveId) return;
    return onSnapshot(vaultDocument(uid, archiveId), snapshot => {
      if (snapshot.exists()) setPreviousBackup((snapshot.data() as CloudVault).encrypted);
    }, () => { /* The active vault can still open without the archived copy. */ });
  }, [uid, archiveId]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) lock(); };
    const onVisibility = () => { if (document.hidden) { setRevealed(""); setShowPassword(false); } };
    window.addEventListener("pagehide", lock);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", lock);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useLayoutEffect(() => {
    if (active) return;
    setRevealed("");
    setShowPassword(false);
    setEditor(undefined);
    setChangingPassword(false);
  }, [active]);

  async function persist(expected: string | null, next: string, ticket: number, archivePrevious = false, offlineEdit = false) {
    if (revision.current !== ticket) throw new Error("O cofre foi bloqueado.");
    const current = cloud.current;
    if ((current?.encrypted ?? legacy.current) !== expected) throw new Error("O cofre mudou em outro aparelho. Confira os registros atualizados.");
    const reference = vaultDocument(uid);
    const archive = archivePrevious && expected ? crypto.randomUUID() : current?.archiveId ?? "";
    const nextDoc: CloudVault = { encrypted: next, revision: crypto.randomUUID(), previous: current?.revision ?? "", archiveId: archive };
    ownWrite.current = nextDoc.revision;
    if (!navigator.onLine && offlineEdit && current && !archivePrevious) {
      await acceptFirestoreWrite(reference, updateDoc(reference, nextDoc), () => {
        setRejectedBackup(next);
        setNotice("Outro aparelho atualizou o cofre. Baixe a cópia das suas alterações para guardá-las.");
      });
    } else {
      if (!navigator.onLine) throw new Error("Conecte-se para criar, transferir ou alterar a senha do cofre.");
      await runTransaction(reference.firestore, async transaction => {
        const snapshot = await transaction.get(reference);
        if ((snapshot.data() as CloudVault | undefined)?.revision !== current?.revision) throw new Error("O cofre mudou em outro aparelho. Confira os registros atualizados.");
        if (archivePrevious && expected) transaction.set(vaultDocument(uid, archive), { encrypted: expected, revision: archive, previous: "", archiveId: "" });
        transaction.set(reference, nextDoc);
      });
      if (legacy.current === expected) {
        try { if (localStorage.getItem(storageKey) === expected) localStorage.removeItem(storageKey); }
        catch { /* Keep the legacy copy if the browser blocks access. */ }
        legacy.current = null;
      }
    }
    cloud.current = nextDoc;
    setStored(next);
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

  const syncLegacy = useEffectEvent(() => {
    if (!synced || cloud.current || !session || session.serialized !== legacy.current) return;
    void run(ticket => persist(session.serialized, session.serialized, ticket));
  });

  useEffect(() => { if (synced) syncLegacy(); }, [synced]);

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    form.reset();
    if (stored === undefined) return;
    setShowPassword(false);
    const password = String(fields.get("password") ?? "");
    const source = startingNewVault ? undefined : stored ?? backup;
    void run(async ticket => {
      if (!source && password.trim().length < 6) {
        throw new Error("Use pelo menos 6 caracteres.");
      }
      const payload = source ? parseVault(source) : undefined;
      const salt = payload?.salt ?? newVaultSalt();
      let key = await deriveVaultKey(payload ? password : password.trim(), salt);
      let entries: VaultEntry[] = [];
      if (payload) {
        try { entries = await decryptVault(payload, key); }
        catch {
          const message = backup ? "A senha não corresponde a este backup." : "Use a senha definida ao criar este cofre. Confira as maiúsculas.";
          if (password === password.trim()) throw new Error(message);
          key = await deriveVaultKey(password.trim(), salt);
          entries = await decryptVault(payload, key).catch(() => { throw new Error(message); });
        }
      }
      const serialized = source ?? await encryptVault(entries, key, salt);
      if (stored === null || startingNewVault || (!cloud.current && navigator.onLine)) await persist(stored, serialized, ticket, startingNewVault);
      if (revision.current !== ticket) return;
      setBackup(undefined);
      setStartingNewVault(false);
      setSession({ key, salt, entries, serialized });
    });
  }

  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const password = String(new FormData(event.currentTarget).get("password") ?? "").trim();
    void run(async ticket => {
      if (password.length < 6) throw new Error("Use pelo menos 6 caracteres.");
      const salt = newVaultSalt();
      const key = await deriveVaultKey(password, salt);
      const serialized = await encryptVault(session.entries, key, salt);
      await persist(session.serialized, serialized, ticket);
      if (revision.current !== ticket) return;
      setSession({ ...session, key, salt, serialized });
      setChangingPassword(false);
    });
  }

  function saveEntries(entries: VaultEntry[]) {
    if (!session) return;
    void run(async ticket => {
      const serialized = await encryptVault(entries, session.key, session.salt);
      await persist(session.serialized, serialized, ticket, false, true);
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

  function exportBackup(serialized: string, filename = "psyzon-cofre-backup.json") {
    const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!active) return null;

  const initializing = startingNewVault || (stored === null && !backup);
  const category = page === "Configurações" ? "Todas" : page;
  const entries = session ? searchVault(session.entries, query, category) : [];
  const current = editor && editor !== "new" ? editor : undefined;
  return <section className="vault-workspace">
    <header className="vault-heading"><div className="vault-title"><span><KeyRound size={22} aria-hidden="true" /></span><h1>Cofre de senhas</h1></div>
      {session && <button type="button" className="secondary" onClick={lock}><Lock size={16} /> Bloquear</button>}
    </header>
    {notice && !editor && !changingPassword && <p role="alert" className="form-error">{notice}</p>}
    {rejectedBackup && <div className="vault-actions"><button type="button" className="secondary" onClick={() => exportBackup(rejectedBackup, "psyzon-cofre-alteracoes.json")}><Download size={16} /> Baixar alterações pendentes</button></div>}
    {stored === undefined && !notice && <p role="status">Conecte-se para carregar o cofre pela primeira vez neste aparelho.</p>}
    {!session ? <div className="panel vault-access">
      <h2>{startingNewVault ? "Definir nova senha" : initializing ? "Criar cofre" : backup ? "Restaurar backup" : "Desbloquear cofre"}</h2>
      <p>Dica da senha: <strong>Cachorro</strong></p>
      {startingNewVault && <p>O novo cofre começa vazio. Os registros anteriores ficam em uma cópia criptografada, que ainda usa a senha antiga.</p>}
      {stored !== undefined && <form key={lockEpoch} onSubmit={unlock}>
        <div className="vault-password"><label>Senha principal<input type={showPassword ? "text" : "password"} name="password" autoCapitalize="none" spellCheck={false} autoCorrect="off" autoComplete={initializing ? "new-password" : "current-password"} required minLength={initializing ? 6 : undefined} maxLength={512}
          aria-describedby={capsLock ? "vault-caps-lock" : undefined}
          onKeyDown={event => setCapsLock(event.getModifierState("CapsLock"))}
          onKeyUp={event => setCapsLock(event.getModifierState("CapsLock"))}
          onBlur={() => setCapsLock(false)} /></label><button type="button" className="secondary" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar senha principal" : "Mostrar senha principal"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        <span id="vault-caps-lock" role="status" hidden={!capsLock}>Caps Lock ativado</span>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Aguarde…" : startingNewVault ? "Salvar nova senha" : initializing ? "Criar cofre" : backup ? "Restaurar cofre" : "Desbloquear"}</button>
      </form>}
      {stored && <div className="vault-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => { setNotice(""); setShowPassword(false); setLockEpoch(epoch => epoch + 1); setStartingNewVault(value => !value); }}>{startingNewVault ? "Cancelar" : "Esqueci a senha"}</button>
        {startingNewVault && <button type="button" className="secondary" onClick={() => exportBackup(stored, "psyzon-cofre-anterior.json")}><Download size={16} /> Baixar cópia anterior</button>}
      </div>}
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
      <nav className="vault-navigation" aria-label="Seções do cofre">{vaultPages.map(item => <button key={item} className="secondary" type="button" aria-current={page === item ? "page" : undefined} onClick={() => { setPage(item); setRevealed(""); setNotice(""); }}>{item}</button>)}</nav>
      {page === "Configurações" ? <section className="panel vault-access" aria-label="Configurações do cofre">
        <h2>Segurança e backup</h2>
        <p>Os registros são sincronizados de forma criptografada na sua conta.</p>
        <p role="status">{pendingSync ? "Alterações aguardando sincronização" : synced && cloud.current ? "Cofre sincronizado" : "Cópia criptografada neste aparelho"}</p>
        <div className="vault-actions">
          <button type="button" className="secondary" onClick={() => exportBackup(session.serialized)}><Download size={16} /> Baixar backup</button>
          {previousBackup && <button type="button" className="secondary" onClick={() => exportBackup(previousBackup, "psyzon-cofre-anterior.json")}><Download size={16} /> Baixar cópia anterior</button>}
          <button type="button" className="secondary" onClick={() => { setNotice(""); setChangingPassword(true); }}><KeyRound size={16} /> Alterar senha</button>
        </div>
      </section> : <>
      <div className="panel vault-toolbar">
        <label className="vault-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Buscar no cofre" placeholder="Buscar por título, usuário ou categoria" value={query} onChange={event => { setRevealed(""); setQuery(event.target.value); }} /></label>
        <button type="button" className="primary" disabled={busy} onClick={() => { setRevealed(""); setNotice(""); setEditor("new"); }}><Plus size={17} /> Novo registro</button>
      </div>
      {editor && <Modal titleId="vault-editor-title" compact busy={busy} close={() => { setEditor(undefined); setNotice(""); }}>
        <header><h2 id="vault-editor-title">{current ? "Editar registro" : "Novo registro"}</h2><button type="button" aria-label="Fechar" disabled={busy} onClick={() => { setEditor(undefined); setNotice(""); }}><X size={18} /></button></header>
        <form className="vault-editor" key={current?.id ?? "new"} onSubmit={saveEntry}>
        <label>Título<input name="title" required maxLength={160} defaultValue={current?.title} /></label>
        <label>Categoria<select name="category" defaultValue={current?.category ?? (category === "Todas" ? "Pessoal" : category)}>{vaultCategories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Usuário ou identificação<input name="login" defaultValue={current?.login} maxLength={240} autoComplete="off" spellCheck={false} /></label>
        <label>Senha ou dado protegido<input name="secret" type="password" defaultValue={current?.secret} maxLength={1024} required autoComplete="new-password" /></label>
        {notice && <p role="alert" className="form-error">{notice}</p>}
        <footer><button type="button" className="secondary" disabled={busy} onClick={() => { setEditor(undefined); setNotice(""); }}>Cancelar</button><button type="submit" className="primary" disabled={busy}>Salvar registro</button></footer>
      </form></Modal>}
      {entries.length ? <ul className="panel vault-list">{entries.map(item => <li key={item.id}>
        <div className="vault-entry"><strong>{item.title}</strong><small>{item.category}{item.login && ` · ${item.login}`}</small>{revealed === item.id && <output>{item.secret}</output>}</div>
        <div className="vault-actions">
          <button className="secondary" type="button" aria-label={`${revealed === item.id ? "Ocultar" : "Mostrar"} senha de ${item.title}`} onClick={() => setRevealed(revealed === item.id ? "" : item.id)}>{revealed === item.id ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          <button className="secondary" type="button" aria-label={`Editar ${item.title}`} disabled={busy} onClick={() => { setRevealed(""); setNotice(""); setEditor(item); }}><Pencil size={17} /></button>
          <button className="secondary" type="button" aria-label={`Excluir ${item.title}`} disabled={busy} onClick={() => { if (window.confirm("Excluir este registro do cofre?")) saveEntries(session.entries.filter(row => row.id !== item.id)); }}><Trash2 size={17} /></button>
        </div>
      </li>)}</ul> : <p className="panel vault-empty">{session.entries.length ? "Nenhum registro com esse filtro." : "Nenhum registro no cofre."}</p>}
      </>}
      {changingPassword && <Modal titleId="vault-change-title" compact busy={busy} close={() => { setChangingPassword(false); setNotice(""); }}>
        <header><h2 id="vault-change-title">Alterar senha</h2><button type="button" aria-label="Fechar" disabled={busy} onClick={() => { setChangingPassword(false); setNotice(""); }}><X size={18} /></button></header>
        <form className="vault-editor" onSubmit={changePassword}>
          <label>Nova senha<input name="password" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required minLength={6} maxLength={512} /></label>
          {notice && <p role="alert" className="form-error">{notice}</p>}
          <footer><button type="submit" className="primary" disabled={busy}>Salvar nova senha</button></footer>
        </form>
      </Modal>}
    </>}
  </section>;
}

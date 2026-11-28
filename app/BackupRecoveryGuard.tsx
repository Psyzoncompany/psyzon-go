"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getApps } from "firebase/app";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import "./backups.css";

export default function BackupRecoveryGuard({ uid }: { uid: string }) {
  const [restoring, setRestoring] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!uid) return;
    let sawRecovery = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const revisionKey = `psyzon:backup-recovery:${uid}`;
    const reload = (revision?: string) => {
      // An old local draft must not overwrite the recovered server version.
      try {
        if (revision) localStorage.setItem(revisionKey, revision);
        localStorage.removeItem(`psyzon:notes:drafts:${uid}`);
        for (const key of Object.keys(localStorage)) if (key.startsWith(`psyzon:finance-pending:${uid}:`)) localStorage.removeItem(key);
      } catch { /* Storage may be unavailable. */ }
      window.location.reload();
    };
    const unsubscribe = onSnapshot(doc(getFirestore(getApps()[0]), "backupLocks", uid), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      const data = snapshot.data();
      const until = data?.expiresAt?.toMillis?.() ?? 0;
      const active = data?.operation === "restore" && data?.status === "working" && until > Date.now();
      clearTimeout(timer);
      if (active) { sawRecovery = true; setRestoring(true); timer = setTimeout(() => reload(), Math.max(1000, until - Date.now() + 1000)); }
      else if (sawRecovery) reload(data?.restoreRevision);
      else {
        try {
          const previous = localStorage.getItem(revisionKey);
          const revision = typeof data?.restoreRevision === "string" ? data.restoreRevision : "initial";
          const oldDrafts = localStorage.getItem(`psyzon:notes:drafts:${uid}`) || Object.keys(localStorage).some(key => key.startsWith(`psyzon:finance-pending:${uid}:`));
          if (revision !== "initial" && (previous ? previous !== revision : oldDrafts)) { reload(revision); return; }
          localStorage.setItem(revisionKey, revision);
        } catch { /* The live recovery still reloads when storage is blocked. */ }
        setRestoring(false);
      }
    }, () => { /* Ordinary work remains available if status cannot be read. */ });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [uid]);
  useEffect(() => {
    const element = dialog.current;
    if (restoring && element && !element.open) element.showModal();
    else if (!restoring && element?.open) element.close();
  }, [restoring]);
  if (typeof document === "undefined") return null;
  return createPortal(<dialog className="backup-recovery-guard" ref={dialog} aria-labelledby="backup-recovery-title" aria-busy="true" onCancel={event => event.preventDefault()}><div><Shield /><h2 id="backup-recovery-title">Recuperando seus dados</h2><p>Aguarde a conferência da cópia. A página será atualizada ao concluir.</p><progress aria-label="Recuperação em andamento" /></div></dialog>, document.body);
}

function Shield() { return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></svg>; }

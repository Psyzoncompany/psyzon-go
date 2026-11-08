"use client";

import { useEffect, useState } from "react";
import { appearanceKey, applyAppearance, defaultAppearance, readAppearance, type InterfaceAppearance } from "./interface-appearance";

export default function useInterfaceAppearance(uid: string) {
  const [saved, setSaved] = useState({ uid: "", appearance: defaultAppearance });
  const [storageError, setStorageError] = useState(false);
  const appearance = saved.uid === uid ? saved.appearance : defaultAppearance;

  useEffect(() => {
    function restore() {
      let value = defaultAppearance;
      setStorageError(false);
      try { if (uid) value = readAppearance(localStorage.getItem(appearanceKey(uid))); }
      catch { setStorageError(true); }
      applyAppearance(value);
      setSaved({ uid, appearance: value });
    }
    restore();
    const sync = (event: StorageEvent) => { if (event.key === appearanceKey(uid) || event.key === null) restore(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [uid]);

  function changeAppearance(patch: Partial<InterfaceAppearance>) {
    if (!uid || saved.uid !== uid) return;
    const value = { ...appearance, ...patch };
    applyAppearance(value);
    setSaved({ uid, appearance: value });
    try { localStorage.setItem(appearanceKey(uid), JSON.stringify(value)); setStorageError(false); }
    catch { setStorageError(true); }
  }

  return { appearance, changeAppearance, storageError, ready: saved.uid === uid };
}

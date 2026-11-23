"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { appearanceKey, applyAppearance, defaultAppearance, readAppearance, type InterfaceAppearance } from "./interface-appearance";
import { enableTheme, loadTheme } from "./theme-styles";

export default function useInterfaceAppearance(uid: string) {
  const [saved, setSaved] = useState({ uid: "", appearance: defaultAppearance });
  const [storageError, setStorageError] = useState(false);
  const [styleError, setStyleError] = useState(false);
  const revision = useRef(0);
  const desired = useRef(defaultAppearance);
  const appearance = saved.uid === uid ? saved.appearance : defaultAppearance;

  const select = useCallback(async (value: InterfaceAppearance, persist: boolean) => {
    const ticket = ++revision.current;
    desired.current = value;
    setStyleError(false);
    try {
      const sheet = await loadTheme(value.theme);
      if (ticket !== revision.current) return;
      enableTheme(sheet);
      applyAppearance(value);
      setSaved({ uid, appearance: value });
      if (persist) {
        try { localStorage.setItem(appearanceKey(uid), JSON.stringify(value)); setStorageError(false); }
        catch { setStorageError(true); }
      }
    } catch {
      if (ticket !== revision.current) return;
      setStyleError(true);
      enableTheme(null);
      applyAppearance(defaultAppearance);
      desired.current = defaultAppearance;
      setSaved({ uid, appearance: defaultAppearance });
    }
  }, [uid]);

  useEffect(() => {
    function restore() {
      let value = defaultAppearance;
      setStorageError(false);
      try { if (uid) value = readAppearance(localStorage.getItem(appearanceKey(uid))); }
      catch { setStorageError(true); }
      void select(value, false);
    }
    restore();
    const sync = (event: StorageEvent) => { if (event.key === appearanceKey(uid) || event.key === null) restore(); };
    window.addEventListener("storage", sync);
    return () => { revision.current++; window.removeEventListener("storage", sync); };
  }, [uid, select]);

  function changeAppearance(patch: Partial<InterfaceAppearance>) {
    if (uid && saved.uid === uid) void select({ ...desired.current, ...patch }, true);
  }

  return { appearance, changeAppearance, storageError, styleError, ready: saved.uid === uid };
}

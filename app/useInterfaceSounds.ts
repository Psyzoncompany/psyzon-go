"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { InterfaceAudio } from "./interface-audio";
import { defaultSoundPreferences, interfaceAudioUnlockEvent, isTypingSoundTarget, readSoundPreferences, soundControl, soundPreferenceKey, type InterfaceSound, type SoundPreferences } from "./interface-sound-model";
import { paymentFeedbackEvent, paymentPreferences, type PaymentSuccess } from "./payment-feedback";

export default function useInterfaceSounds(uid: string) {
  const [saved, setSaved] = useState({ uid: "", preferences: defaultSoundPreferences });
  const [storageError, setStorageError] = useState(false);
  const engine = useRef<InterfaceAudio | null>(null);
  const preferences = saved.uid === uid ? saved.preferences : defaultSoundPreferences;

  useEffect(() => {
    if (!uid) return;
    const key = soundPreferenceKey(uid);
    let restored = defaultSoundPreferences;
    let blockedStorage = false;
    try { restored = readSoundPreferences(localStorage.getItem(key)); }
    catch { blockedStorage = true; }
    const audio = new InterfaceAudio(restored);
    engine.current = audio;
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      setStorageError(blockedStorage);
      setSaved({ uid, preferences: restored });
    });
    let pendingClick: number | undefined;
    const unlock = (event: Event) => {
      if (!event.isTrusted) return;
      // A touch pointerdown is not an audio activation gesture in iOS Safari.
      if (event.type === "pointerdown" && (event as PointerEvent).pointerType !== "mouse") return;
      audio.unlock();
    };
    const prepare = (event: Event) => { if ((event as CustomEvent<string>).detail === uid) audio.unlock(); };
    const success = (event: Event) => {
      const value = (event as CustomEvent<PaymentSuccess>).detail;
      if (value?.uid === uid && paymentPreferences(uid).sound) {
        window.clearTimeout(pendingClick);
        void audio.playWhenReady("success");
      }
    };
    const click = (event: MouseEvent) => {
      if (!event.isTrusted || !soundControl(event.target)) return;
      audio.unlock();
      window.clearTimeout(pendingClick);
      pendingClick = window.setTimeout(() => audio.play("click"), 0);
    };
    const input = (event: Event) => {
      if (!event.isTrusted || (event as InputEvent).isComposing || !isTypingSoundTarget(event.target)) return;
      const inputType = (event as InputEvent).inputType;
      if (inputType && !/^(insert|delete)/.test(inputType)) return;
      audio.unlock();
      audio.play("type");
    };
    const visibility = () => {
      if (document.hidden) { window.clearTimeout(pendingClick); audio.suspend(); }
      else audio.unlock(false);
    };
    const pagehide = () => { window.clearTimeout(pendingClick); audio.suspend(); };
    const sync = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      let next = defaultSoundPreferences;
      try { next = readSoundPreferences(localStorage.getItem(key)); }
      catch { setStorageError(true); }
      audio.configure(next);
      setSaved({ uid, preferences: next });
    };
    document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    document.addEventListener("touchend", unlock, { capture: true, passive: true });
    document.addEventListener("click", unlock, { capture: true });
    document.addEventListener("keydown", unlock, { capture: true });
    document.addEventListener("click", click);
    document.addEventListener("input", input);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", visibility);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener(interfaceAudioUnlockEvent, prepare);
    window.addEventListener(paymentFeedbackEvent, success);
    window.addEventListener("storage", sync);
    return () => {
      disposed = true;
      window.clearTimeout(pendingClick);
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("touchend", unlock, true);
      document.removeEventListener("click", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("click", click);
      document.removeEventListener("input", input);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener(interfaceAudioUnlockEvent, prepare);
      window.removeEventListener(paymentFeedbackEvent, success);
      window.removeEventListener("storage", sync);
      audio.dispose();
      if (engine.current === audio) engine.current = null;
    };
  }, [uid]);

  function changePreferences(patch: Partial<SoundPreferences>) {
    if (!uid || saved.uid !== uid) return;
    const next = { ...preferences, ...patch };
    engine.current?.configure(next);
    engine.current?.unlock();
    setSaved({ uid, preferences: next });
    try { localStorage.setItem(soundPreferenceKey(uid), JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  }

  const preview = (kind: InterfaceSound) => { void engine.current?.preview(kind); };
  const notify = useCallback(() => { engine.current?.play("notification"); }, []);
  return { preferences, changePreferences, preview, notify, storageError };
}

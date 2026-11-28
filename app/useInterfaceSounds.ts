"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { InterfaceAudio } from "./interface-audio";
import { controlSound, defaultSoundPreferences, interfaceAudioUnlockEvent, interfaceNavigationEvent, isTypingSoundTarget, readSoundPreferences, soundControl, soundPreferenceKey, type InterfaceSound, type SoundPreferences } from "./interface-sound-model";
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
    let pendingAction: "click" | "close" | "navigate" | undefined;
    const consoleTheme = () => document.documentElement.dataset.uiTheme === "ps5";
    const clearPending = () => {
      window.clearTimeout(pendingClick);
      pendingClick = undefined;
      pendingAction = undefined;
    };
    const queue = (kind: "click" | "close" | "navigate") => {
      const priority = { click: 0, close: 1, navigate: 2 };
      if (pendingAction && priority[kind] < priority[pendingAction]) return;
      pendingAction = kind;
      window.clearTimeout(pendingClick);
      // Capture the control before React removes it. Coalesce its click with
      // the navigation/close produced by the same interaction.
      pendingClick = window.setTimeout(() => {
        const action = pendingAction;
        clearPending();
        if (action) void audio.playWhenReady(action);
      }, 0);
    };
    const afterDismiss = (element: Element) => {
      if (!element.isConnected || !element.getClientRects().length) return;
      // Native event dispatch may run microtasks between capture and target
      // listeners. Wait for the complete event and React's close commit.
      window.setTimeout(() => {
        if (disposed) return;
        const closed = !element.isConnected || (element instanceof HTMLDialogElement ? !element.open : !element.getClientRects().length);
        if (closed) queue("close");
      }, 0);
    };
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
        clearPending();
        void audio.playWhenReady("success");
      }
    };
    const click = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      const control = soundControl(event.target);
      if (consoleTheme() && event.target instanceof HTMLDialogElement && event.target.open) afterDismiss(event.target);
      if (!control) return;
      audio.unlock();
      queue(controlSound(control, consoleTheme()));
    };
    const navigate = () => { if (consoleTheme()) queue("navigate"); };
    const escape = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.key !== "Escape" || event.repeat || !consoleTheme()) return;
      document.querySelectorAll('dialog[open], [role="dialog"]').forEach(afterDismiss);
    };
    const backdrop = (event: MouseEvent) => {
      if (!event.isTrusted || !consoleTheme() || !(event.target instanceof Element) || !event.target.matches(".an-modal-backdrop")) return;
      const dialog = event.target.querySelector('[role="dialog"]');
      if (dialog) afterDismiss(dialog);
    };
    const cancel = (event: Event) => {
      if (event.isTrusted && consoleTheme() && event.target instanceof HTMLDialogElement) afterDismiss(event.target);
    };
    const input = (event: Event) => {
      if (!event.isTrusted || (event as InputEvent).isComposing || !isTypingSoundTarget(event.target)) return;
      const inputType = (event as InputEvent).inputType;
      if (inputType && !/^(insert|delete)/.test(inputType)) return;
      audio.unlock();
      audio.play("type");
    };
    const visibility = () => {
      if (document.hidden) { clearPending(); audio.suspend(); }
      else audio.unlock(false);
    };
    const pagehide = () => { clearPending(); audio.suspend(); };
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
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("mousedown", backdrop, true);
    document.addEventListener("cancel", cancel, true);
    document.addEventListener("input", input);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", visibility);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener(interfaceAudioUnlockEvent, prepare);
    window.addEventListener(interfaceNavigationEvent, navigate);
    window.addEventListener(paymentFeedbackEvent, success);
    window.addEventListener("storage", sync);
    return () => {
      disposed = true;
      clearPending();
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("touchend", unlock, true);
      document.removeEventListener("click", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("mousedown", backdrop, true);
      document.removeEventListener("cancel", cancel, true);
      document.removeEventListener("input", input);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener(interfaceAudioUnlockEvent, prepare);
      window.removeEventListener(interfaceNavigationEvent, navigate);
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

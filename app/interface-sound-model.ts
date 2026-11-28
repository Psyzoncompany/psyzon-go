export const interfaceSoundFiles = {
  click: "/sounds/ps5-confirm-v3.wav",
  navigate: "/sounds/ps5-navigate-v3.wav",
  close: "/sounds/ps5-close-v3.wav",
  type: "/sounds/type-v1.mp3",
  notification: "/sounds/ps5-notification-v1.mp3",
  success: "/sounds/ps5-original-trophy-v1.mp3",
} as const;
export type InterfaceSound = keyof typeof interfaceSoundFiles;
export type SoundPreferences = { enabled: boolean; volume: number } & Record<InterfaceSound, boolean>;
export const defaultSoundPreferences: SoundPreferences = { enabled: true, volume: 18, click: true, navigate: true, close: true, type: true, notification: true, success: true };
export const soundPreferenceKey = (uid: string) => `psy-interface-sounds-v1:${uid}`;
export const interfaceNavigationEvent = "psyzon-interface-navigation";
export const interfaceAudioUnlockEvent = "psyzon-interface-audio-unlock";

export function readSoundPreferences(raw: string | null): SoundPreferences {
  try {
    const value = JSON.parse(raw || "{}") ?? {};
    return {
      enabled: value.enabled !== false,
      volume: typeof value.volume === "number" && Number.isFinite(value.volume) ? Math.max(0, Math.min(100, Math.round(value.volume))) : defaultSoundPreferences.volume,
      click: value.click !== false,
      navigate: typeof value.navigate === "boolean" ? value.navigate : value.click !== false,
      close: typeof value.close === "boolean" ? value.close : value.click !== false,
      type: value.type !== false,
      notification: value.notification !== false,
      success: value.success !== false,
    };
  } catch { return defaultSoundPreferences; }
}

export function controlSound(control: Element, consoleTheme: boolean): "click" | "close" {
  if (!consoleTheme) return "click";
  const label = control.getAttribute("aria-label") || control.textContent || "";
  return /^(fechar|cancelar|voltar|sair)\b/i.test(label.trim()) ? "close" : "click";
}

export function soundControl(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest('[data-ui-sound="off"], [data-view="cofre"]')) return null;
  const control = target.closest('button, a[href], summary, select, input[type="checkbox"], input[type="radio"], [role="button"], [role="tab"]');
  if (!control || control.matches(':disabled, [aria-disabled="true"]') || control.closest("[inert]")) return null;
  return control;
}

export function isTypingSoundTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement) || target.closest('[data-ui-sound="off"], [data-view="cofre"], [inert]')) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly && !target.disabled;
  return target instanceof HTMLInputElement && ["text", "search", "email", "tel", "url", "number"].includes(target.type) &&
    !target.readOnly && !target.disabled && !/password|one-time-code/.test(target.autocomplete);
}

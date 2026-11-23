export const interfaceSoundFiles = {
  click: "/sounds/click-v1.mp3",
  navigate: "/sounds/navigate-v1.mp3",
  type: "/sounds/type-v1.mp3",
} as const;
export type InterfaceSound = keyof typeof interfaceSoundFiles;
export type SoundPreferences = { enabled: boolean; volume: number; click: boolean; navigate: boolean; type: boolean };
export const defaultSoundPreferences: SoundPreferences = { enabled: true, volume: 18, click: true, navigate: true, type: true };
export const soundPreferenceKey = (uid: string) => `psy-interface-sounds-v1:${uid}`;
export const interfaceNavigationEvent = "psyzon-interface-navigation";

export function readSoundPreferences(raw: string | null): SoundPreferences {
  try {
    const value = JSON.parse(raw || "{}") ?? {};
    return {
      enabled: value.enabled !== false,
      volume: typeof value.volume === "number" && Number.isFinite(value.volume) ? Math.max(0, Math.min(100, Math.round(value.volume))) : defaultSoundPreferences.volume,
      click: value.click !== false,
      navigate: value.navigate !== false,
      type: value.type !== false,
    };
  } catch { return defaultSoundPreferences; }
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

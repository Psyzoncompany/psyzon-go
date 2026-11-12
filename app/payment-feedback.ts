export type PaymentSuccess = { uid: string; title: string; description: string; amount: number; id: string };
export const paymentFeedbackEvent = "psyzon-payment-success";
export const paymentPreferenceEvent = "psyzon-payment-preferences";
export const paymentPreferenceKey = (uid: string) => `psy-payment-feedback-v1:${uid}`;
export function paymentPreferences(uid: string): { sound: boolean; animation: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem(paymentPreferenceKey(uid)) || "{}");
    return { sound: value.sound !== false, animation: value.animation !== false };
  } catch { return { sound: true, animation: true }; }
}
export function savePaymentPreferences(uid: string, value: ReturnType<typeof paymentPreferences>) {
  try { localStorage.setItem(paymentPreferenceKey(uid), JSON.stringify(value)); } catch { /* Feedback remains usable without storage. */ }
  if (!value.sound) void audioContext?.suspend().catch(() => {});
  window.dispatchEvent(new Event(paymentPreferenceEvent));
}
let audioContext: AudioContext | undefined;
let audioReady: Promise<void> | undefined;
export function preparePaymentSound(uid: string) {
  if (!paymentPreferences(uid).sound || typeof window === "undefined") return;
  try {
    const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    audioContext ??= new Audio();
    audioReady = audioContext.resume().catch(() => {});
  } catch { /* Audio is optional; browsers can block it. */ }
}
export function paymentSucceeded(value: Omit<PaymentSuccess, "id">) {
  window.dispatchEvent(new CustomEvent<PaymentSuccess>(paymentFeedbackEvent, { detail: { ...value, id: crypto.randomUUID() } }));
  const confirmedAt = performance.now();
  void Promise.resolve(audioReady).then(() => playPaymentSound(value.uid, confirmedAt));
}
function playPaymentSound(uid: string, confirmedAt: number) {
  if (!paymentPreferences(uid).sound || !audioContext || audioContext.state !== "running" || performance.now() - confirmedAt > 1000) return;
  try {
    const context = audioContext;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const start = context.currentTime + index * .085;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.055, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .38);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + .4);
    });
  } catch { /* A successful save must never depend on sound playback. */ }
}

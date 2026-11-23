import { interfaceAudioUnlockEvent } from "./interface-sound-model";
export type PaymentSuccess = { uid: string; title: string; description: string; amount?: number; id: string; kind?: "tick" | "milestone"; progress?: number; previousProgress?: number };
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

  window.dispatchEvent(new Event(paymentPreferenceEvent));
}
export function preparePaymentSound(uid: string) {
  if (typeof window !== "undefined" && paymentPreferences(uid).sound) window.dispatchEvent(new CustomEvent(interfaceAudioUnlockEvent, { detail: uid }));
}
export function paymentSucceeded(value: Omit<PaymentSuccess, "id" | "amount"> & { amount: number }) { notifySuccess(value); }
export function activitySucceeded(value: Omit<PaymentSuccess, "id" | "amount">) { notifySuccess({ ...value, kind: value.kind ?? "tick" }); }
function notifySuccess(value: Omit<PaymentSuccess,"id">) {
  window.dispatchEvent(new CustomEvent<PaymentSuccess>(paymentFeedbackEvent, { detail: { ...value, id: crypto.randomUUID() } }));
}

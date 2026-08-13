import { Capacitor } from "@capacitor/core";

const DAILY_REMINDERS = [
  {
    id: 801,
    hour: 8,
    body: "Bom dia! Confira os pedidos, prazos e contas de hoje.",
  },
  {
    id: 1401,
    hour: 14,
    body: "Boa tarde! Revise o andamento da produção e as pendências do dia.",
  },
  {
    id: 1901,
    hour: 19,
    body: "Fechamento do dia: atualize pedidos, recebimentos e despesas.",
  },
] as const;

export type DailyReminderStatus = "scheduled" | "disabled" | "denied" | "web";

export async function syncDailyReminders(enabled: boolean, requestPermission = false): Promise<DailyReminderStatus> {
  if (!Capacitor.isNativePlatform()) return "web";

  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const descriptors = DAILY_REMINDERS.map(({ id }) => ({ id }));

  if (!enabled) {
    await LocalNotifications.cancel({ notifications: descriptors });
    return "disabled";
  }

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted" && requestPermission) {
    permission = await LocalNotifications.requestPermissions();
  }
  if (permission.display !== "granted") return "denied";

  await LocalNotifications.createChannel({
    id: "daily-reminders",
    name: "Lembretes diários",
    description: "Lembretes de rotina do PSYZON GO",
    importance: 4,
    visibility: 1,
    vibration: true,
  });

  await LocalNotifications.cancel({ notifications: descriptors });
  await LocalNotifications.schedule({
    notifications: DAILY_REMINDERS.map(({ id, hour, body }) => ({
      id,
      title: "PSYZON GO",
      body,
      channelId: "daily-reminders",
      autoCancel: true,
      schedule: {
        on: { hour, minute: 0 },
        allowWhileIdle: true,
      },
      extra: { destination: "inicio" },
    })),
  });

  return "scheduled";
}

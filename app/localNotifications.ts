import { Capacitor } from "@capacitor/core";
import { buildReminderContent, type ReminderAttentionItem } from "./notification-content";

const DAILY_REMINDERS = [
  {
    id: 801,
    hour: 8,
    fallbackBody: "Bom dia! Confira os pedidos, prazos e contas de hoje.",
  },
  {
    id: 1401,
    hour: 14,
    fallbackBody: "Boa tarde! Revise o andamento da produção e as pendências do dia.",
  },
  {
    id: 1901,
    hour: 19,
    fallbackBody: "Fechamento do dia: atualize pedidos, recebimentos e despesas.",
  },
] as const;

export type DailyReminderStatus = "scheduled" | "disabled" | "denied" | "unsupported" | "web";

export async function syncDailyReminders(
  enabled: boolean,
  requestPermission = false,
  attentionItems: ReminderAttentionItem[] = [],
): Promise<DailyReminderStatus> {
  if (!Capacitor.isNativePlatform()) return "web";
  if (!Capacitor.isPluginAvailable("LocalNotifications")) return "unsupported";

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
    notifications: DAILY_REMINDERS.map(({ id, hour, fallbackBody }) => {
      const content = buildReminderContent(attentionItems, fallbackBody);
      return {
        id,
        title: content.title,
        body: content.body,
        largeBody: content.body,
        channelId: "daily-reminders",
        autoCancel: true,
        schedule: {
          on: { hour, minute: 0 },
          allowWhileIdle: true,
        },
        extra: { destination: content.destination },
      };
    }),
  });

  return "scheduled";
}

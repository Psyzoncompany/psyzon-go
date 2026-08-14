import { Capacitor } from "@capacitor/core";

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

export type DailyReminderStatus = "scheduled" | "disabled" | "denied" | "web";
export type ReminderAttentionItem = {
  title: string;
  detail: string;
  tone: "danger" | "warning" | "info";
  view: string;
};

export function buildReminderContent(items: ReminderAttentionItem[], fallbackBody: string) {
  const [priority, ...remaining] = items;
  if (!priority) return { title: "PSYZON GO · Rotina do dia", body: fallbackBody, destination: "inicio" };

  const additionalItems = remaining.slice(0, 2).map((item) => `• ${item.title}`);
  const hiddenCount = Math.max(0, remaining.length - additionalItems.length);
  const lines = [priority.detail, ...additionalItems];
  if (hiddenCount) lines.push(`+ ${hiddenCount} outra(s) pendência(s)`);

  return {
    title: priority.title,
    body: lines.join("\n"),
    destination: priority.view,
  };
}

export async function syncDailyReminders(
  enabled: boolean,
  requestPermission = false,
  attentionItems: ReminderAttentionItem[] = [],
): Promise<DailyReminderStatus> {
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
    notifications: DAILY_REMINDERS.map(({ id, hour, fallbackBody }) => {
      const content = buildReminderContent(attentionItems, fallbackBody);
      return {
        id,
        title: content.title,
        body: content.body,
        largeBody: content.body,
        summaryText: attentionItems.length > 1 ? `${attentionItems.length} itens precisam de atenção` : undefined,
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

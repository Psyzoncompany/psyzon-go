export type ReminderAttentionItem = {
  title: string;
  detail: string;
  systemDetail?: string;
  view: string;
};

export function buildReminderContent(items: ReminderAttentionItem[], fallbackBody: string) {
  const [priority, ...remaining] = items;
  if (!priority) return { title: "PSYZON GO · Rotina do dia", body: fallbackBody, destination: "inicio" };

  const additionalItems = remaining.slice(0, 3).map((item) => `• ${item.title}`);
  const hiddenCount = remaining.length - additionalItems.length;
  const lines = [priority.systemDetail ?? priority.detail, ...additionalItems];
  if (hiddenCount) lines.push(hiddenCount === 1 ? "+ 1 outra pendência" : `+ ${hiddenCount} outras pendências`);

  return { title: priority.title, body: lines.join("\n"), destination: priority.view };
}

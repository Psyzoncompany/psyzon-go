import { localDateValue, roundMoney } from "./finance-model";
import { millis } from "./notes-model";

export type FlowMovement = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  account: "business" | "personal";
  transactionDate?: string;
  createdAt?: unknown;
  category?: string;
  source?: string;
  orderId?: string;
  billId?: string;
  customerId?: string;
};

export type Period = 7 | 30 | 90 | 365;
export const flowPeriods = [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], [365, "12 meses"]] as const;
export const flowDate = (date: string) => date ? date.split("-").reverse().join("/") : "Sem data";

export function movementDay(item: FlowMovement) {
  const created = millis(item.createdAt);
  return item.transactionDate || (created > 0 ? localDateValue(new Date(created)) : "");
}

export function dayOffset(day: string, offset: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function cashTotals(items: FlowMovement[]) {
  let received = 0, spent = 0;
  for (const item of items) {
    if (item.type === "income") received += item.amount;
    if (item.type === "expense") spent += item.amount;
  }
  return { received: roundMoney(received), spent: roundMoney(spent), result: roundMoney(received - spent) };
}

export function flowSeries(items: FlowMovement[], today: string, period: Period) {
  const end = new Date(today + "T12:00:00Z");
  const start = period === 365
    ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1)).toISOString().slice(0, 10)
    : dayOffset(today, 1 - period);
  const step = period === 7 ? 1 : 7;
  const starts: string[] = [];
  for (let day = start; day <= today; ) {
    starts.push(day);
    if (period === 365) {
      const date = new Date(day + "T12:00:00Z");
      date.setUTCMonth(date.getUTCMonth() + 1);
      day = date.toISOString().slice(0, 10);
    } else day = dayOffset(day, step);
  }
  const inPeriod = items.filter(item => {
    const day = movementDay(item);
    return day >= start && day <= today && item.type !== "transfer";
  });
  return {
    items: inPeriod,
    points: starts.map((from, index) => ({
      from,
      ...cashTotals(inPeriod.filter(item => {
        const day = movementDay(item);
        return day >= from && (!starts[index + 1] || day < starts[index + 1]);
      })),
    })),
  };
}

export type BalanceEntry = { id: string; amount: number; description: string; date: string };
export const companyBalance = (entries: BalanceEntry[]) => Math.round(entries.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

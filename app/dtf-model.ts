import { customerNameKey } from "./finance-model";

export const dtfStages = ["Orçamento", "Aguardando arte", "Em impressão", "Pronto", "Entregue"] as const;
export type DtfStage = (typeof dtfStages)[number];

export type DtfInput = {
  title: string;
  customerId: string;
  customerName: string;
  phone: string;
  lengthCm: number;
  widthCm: number;
  priceCents: number;
  paidCents: number;
  dueDate: string;
  stage: DtfStage;
  artworkUrl: string;
  notes: string;
  photoData: string;
};

export type DtfOrder = DtfInput & { id: string; updatedAt?: unknown };

const totalCents = (item: Pick<DtfInput, "lengthCm" | "priceCents">) => Math.floor((item.lengthCm * item.priceCents + 50) / 100);
export const dtfTotal = (item: Pick<DtfInput, "lengthCm" | "priceCents">) => totalCents(item) / 100;
export const dtfPending = (item: DtfInput) => Math.max(0, totalCents(item) - item.paidCents) / 100;
export const dtfCode = (id: string) => id.slice(0, 8).toUpperCase();
export const dtfDate = (value: string) => value ? value.split("-").reverse().join("/") : "Sem prazo";
export const dtfOverdue = (item: DtfInput, today: string) => item.stage !== "Entregue" && !!item.dueDate && item.dueDate < today;

export function dtfArtworkLink(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function dtfForCustomer(order: DtfInput, customer: { id: string; name: string }) {
  return order.customerId === customer.id || (order.customerId.startsWith("legacy-") && customerNameKey(order.customerName) === customerNameKey(customer.name));
}

export function validateDtf(input: DtfInput) {
  if (!input.title) throw new Error("Informe o nome do pedido.");
  if (input.customerId && !input.customerName) throw new Error("Selecione o cliente do pedido.");
  if (!Number.isInteger(input.lengthCm) || input.lengthCm < 1 || input.lengthCm > 1000000) throw new Error("Informe uma metragem entre 0,01 e 10.000 m.");
  if (!Number.isFinite(input.widthCm) || input.widthCm < 0 || input.widthCm > 300) throw new Error("Informe uma largura de até 300 cm ou deixe o campo vazio.");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > 1000000) throw new Error("Confira o preço por metro.");
  if (!Number.isInteger(input.paidCents) || input.paidCents < 0 || input.paidCents > totalCents(input)) throw new Error("O valor recebido precisa estar entre zero e o total do pedido.");
  if (input.artworkUrl && !dtfArtworkLink(input.artworkUrl)) throw new Error("Use um link de arte que comece com http:// ou https://.");
}

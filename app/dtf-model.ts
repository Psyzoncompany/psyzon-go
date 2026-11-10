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
  referencePhotos?: string;
  quantity?: number;
  separated?: boolean;
};

export type DtfOrder = DtfInput & { id: string; updatedAt?: unknown; printsData?: string };
export type DtfPrint = { id: string; title: string; customerId: string; customerName: string; quantity: number; photoData: string; separated: boolean };
export type DtfPrintChange = { type: "add"; print: DtfPrint } | { type: "edit"; print: DtfPrint } | { type: "separate"; id: string; separated: boolean } | { type: "delete"; id: string };
export const maxDtfPrints = 50;
export const maxDtfPrintPhoto = 18000;
export const maxDtfPhotos = 8;
export const maxDtfPhotoData = 450000;
const isReferencePhoto = (photo: unknown): photo is string => typeof photo === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo);

export function dtfPhotos(order: Pick<DtfInput, "photoData" | "referencePhotos">) {
  const photos = isReferencePhoto(order.photoData) ? [order.photoData] : [];
  if (!order.referencePhotos) return photos;
  try {
    const extra: unknown = JSON.parse(order.referencePhotos);
    if (Array.isArray(extra)) photos.push(...extra.slice(0, maxDtfPhotos - photos.length).filter(isReferencePhoto));
  } catch { /* Keep the original cover if the additional references are unreadable. */ }
  return photos;
}

export function packDtfPhotos(photos: string[]) {
  const [photoData = "", ...extra] = photos;
  const referencePhotos = extra.length ? JSON.stringify(extra) : "";
  if (photos.length > maxDtfPhotos || photoData.length + referencePhotos.length > maxDtfPhotoData || !photos.every(isReferencePhoto)) {
    throw new Error("Limite de imagens atingido. Remova uma imagem ou use arquivos menores.");
  }
  return { photoData, referencePhotos };
}

function isDtfPrint(value: unknown): value is DtfPrint {
  if (!value || typeof value !== "object") return false;
  const print = value as DtfPrint;
  return typeof print.id === "string" && /^[\w-]{1,64}$/.test(print.id)
    && typeof print.title === "string" && !!print.title.trim() && print.title.length <= 160
    && typeof print.customerId === "string" && print.customerId.length <= 1500
    && typeof print.customerName === "string" && print.customerName.length <= 120
    && Number.isInteger(print.quantity) && print.quantity >= 1 && print.quantity <= 10000
    && typeof print.separated === "boolean" && typeof print.photoData === "string"
    && (print.photoData === "" || (print.photoData.length <= maxDtfPrintPhoto && isReferencePhoto(print.photoData)));
}

export function readDtfPrints(data?: string): DtfPrint[] {
  if (!data) return [];
  try {
    const prints: unknown = JSON.parse(data);
    return Array.isArray(prints) ? prints.slice(0, maxDtfPrints).filter(isDtfPrint) : [];
  } catch { return []; }
}

export function changeDtfPrints(data: string | undefined, change: DtfPrintChange) {
  const prints = readDtfPrints(data);
  if (change.type === "add") {
    if (prints.length >= maxDtfPrints) throw new Error(`Cada metro ou lote comporta até ${maxDtfPrints} estampas.`);
    if (!isDtfPrint(change.print)) throw new Error("Confira o nome, a quantidade e a imagem da estampa.");
    if (prints.some(print => print.id === change.print.id)) return data ?? "[]";
    prints.push(change.print);
  } else {
    const id = change.type === "edit" ? change.print.id : change.id;
    const index = prints.findIndex(print => print.id === id);
    if (index < 0) throw new Error("Esta estampa já foi removida.");
    if (change.type === "edit") {
      if (!isDtfPrint(change.print)) throw new Error("Confira o nome, a quantidade e a imagem da estampa.");
      prints[index] = { ...change.print, separated: prints[index].separated };
    } else if (change.type === "separate") prints[index] = { ...prints[index], separated: change.separated };
    else prints.splice(index, 1);
  }
  const result = JSON.stringify(prints);
  if (new TextEncoder().encode(result).length > 500000) throw new Error("O lote atingiu o limite de imagens. Use referências mais leves ou abra outro lote.");
  return result;
}

const totalCents = (item: Pick<DtfInput, "lengthCm" | "priceCents">) => Math.floor((item.lengthCm * item.priceCents + 50) / 100);
export const dtfTotal = (item: Pick<DtfInput, "lengthCm" | "priceCents">) => totalCents(item) / 100;
export const dtfPending = (item: DtfInput) => Math.max(0, totalCents(item) - item.paidCents) / 100;
export const dtfCode = (id: string) => id.slice(0, 8).toUpperCase();
export const dtfTitle = (order: Pick<DtfOrder, "id" | "title">) => order.title || "Pedido DTF";
export const dtfDate = (value: string) => value ? value.split("-").reverse().join("/") : "Sem prazo";
export const dtfOverdue = (item: DtfInput, today: string) => item.stage !== "Entregue" && !!item.dueDate && item.dueDate < today;

export function dtfArtworkLink(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function dtfForCustomer(order: Pick<DtfInput, "customerId" | "customerName">, customer: { id: string; name: string }) {
  return order.customerId === customer.id || (order.customerId.startsWith("legacy-") && customerNameKey(order.customerName) === customerNameKey(customer.name));
}


export function validateDtf(input: DtfInput) {
  if (input.separated !== undefined && typeof input.separated !== "boolean") throw new Error("Confira a separação do pedido.");
  if (input.customerId && !input.customerName) throw new Error("Selecione o cliente do pedido.");
  if (!Number.isInteger(input.lengthCm) || input.lengthCm < 0 || input.lengthCm > 1000000) throw new Error("Informe uma metragem de até 10.000 m.");
  if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 10000)) throw new Error("Confira a quantidade. Use um número inteiro de até 10.000.");
  if (!Number.isFinite(input.widthCm) || input.widthCm < 0 || input.widthCm > 300) throw new Error("Informe uma largura de até 300 cm ou deixe o campo vazio.");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > 1000000) throw new Error("Confira o preço por metro.");
  if (!Number.isInteger(input.paidCents) || input.paidCents < 0 || input.paidCents > totalCents(input)) throw new Error("O valor recebido precisa estar entre zero e o total do pedido.");
  if (input.artworkUrl && !dtfArtworkLink(input.artworkUrl)) throw new Error("Use um link de arte que comece com http:// ou https://.");
}

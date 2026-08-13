import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { integrationEvents } from "../../../../db/schema";
import { fetchMercadoPagoPayment, upsertMercadoPagoPayment } from "../../../lib/server/mercado-pago";
import { mercadoPagoEventKey, verifyMercadoPagoSignature } from "../../../lib/server/mercado-pago-webhook";

export async function POST(request: Request) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? "";
  const ownerUserId = process.env.MERCADO_PAGO_OWNER_FIREBASE_UID?.trim() ?? "";
  if (!secret || !ownerUserId || !process.env.MERCADO_PAGO_ACCESS_TOKEN) return Response.json({ error: "Webhook não configurado." }, { status: 503 });
  const body = await request.json().catch(() => null) as { id?: number | string; action?: string; type?: string; data?: { id?: number | string } } | null;
  const url = new URL(request.url); const dataId = String(url.searchParams.get("data.id") ?? body?.data?.id ?? "");
  const requestId = request.headers.get("x-request-id") ?? ""; const signature = request.headers.get("x-signature") ?? "";
  if (!dataId || !requestId || !await verifyMercadoPagoSignature(secret, dataId, requestId, signature)) return Response.json({ error: "Assinatura inválida." }, { status: 401 });
  if (body?.type !== "payment") return Response.json({ accepted: true, ignored: true });
  const eventKey = mercadoPagoEventKey(body.id, requestId, body.action);
  const db = getDb();
  const [existing] = await db.select().from(integrationEvents).where(and(eq(integrationEvents.eventKey, eventKey), eq(integrationEvents.status, "processed"))).limit(1);
  if (existing) return Response.json({ accepted: true, duplicate: true });
  await db.insert(integrationEvents).values({ eventKey, provider: "mercado_pago", ownerUserId, providerEntityId: dataId, action: body?.action ?? "payment.updated", status: "received" }).onConflictDoNothing();
  try {
    const payment = await fetchMercadoPagoPayment(dataId);
    await upsertMercadoPagoPayment(ownerUserId, payment);
    await db.update(integrationEvents).set({ status: "processed", processedAt: Math.floor(Date.now() / 1000), errorMessage: null }).where(eq(integrationEvents.eventKey, eventKey));
    return Response.json({ accepted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 160) : "Erro ao processar";
    await db.update(integrationEvents).set({ status: "error", errorMessage: message }).where(eq(integrationEvents.eventKey, eventKey));
    console.error("Mercado Pago webhook failed", { eventKey, code: message });
    return Response.json({ accepted: false }, { status: 502 });
  }
}

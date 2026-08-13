import { fetchMercadoPagoPayment } from "../../../lib/server/mercado-pago";
import { verifyMercadoPagoSignature } from "../../../lib/server/mercado-pago-webhook";

export async function POST(request: Request) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? "";
  const ownerUserId = process.env.MERCADO_PAGO_OWNER_FIREBASE_UID?.trim() ?? "";
  if (!secret || !ownerUserId || !process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    return Response.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { type?: string; data?: { id?: number | string } } | null;
  const url = new URL(request.url);
  const dataId = String(url.searchParams.get("data.id") ?? body?.data?.id ?? "");
  const requestId = request.headers.get("x-request-id") ?? "";
  const signature = request.headers.get("x-signature") ?? "";
  if (!dataId || !requestId || !await verifyMercadoPagoSignature(secret, dataId, requestId, signature)) {
    return Response.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  if (body?.type !== "payment") return Response.json({ accepted: true, ignored: true });

  try {
    // Confirma que o pagamento existe na API oficial. A próxima sincronização
    // autenticada da PSYZON AI persiste e reconcilia os dados no Firestore.
    await fetchMercadoPagoPayment(dataId);
    return Response.json({ accepted: true, syncOnNextAccess: true });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN";
    console.error("Mercado Pago webhook validation failed", { code });
    return Response.json({ accepted: false }, { status: 502 });
  }
}

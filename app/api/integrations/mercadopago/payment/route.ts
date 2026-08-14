import { authenticateFirebaseRequest, listUserCollection } from "../../../../lib/server/firebase-rest";
import { findMercadoPagoPayment, mercadoPagoImportPreview, upsertMercadoPagoPayment } from "../../../../lib/server/mercado-pago";

function paymentLookupError(error: unknown) {
  if (error instanceof Response) return error;
  const code = error instanceof Error ? error.message : "UNKNOWN";
  console.error("Mercado Pago payment lookup error", { code });
  const messages: Record<string, [string, number]> = {
    MERCADO_PAGO_NOT_CONFIGURED: ["A integração do Mercado Pago ainda não está configurada.", 503],
    MERCADO_PAGO_INVALID_IDENTIFIER: ["Informe um ID de pagamento ou uma referência Pix válida.", 400],
    MERCADO_PAGO_HTTP_401: ["A credencial do Mercado Pago foi recusada. Atualize o Access Token.", 502],
    MERCADO_PAGO_HTTP_403: ["A conta não permitiu consultar esse pagamento.", 502],
  };
  const [message, status] = messages[code] ?? ["Não foi possível consultar esse pagamento no Mercado Pago.", 502];
  return Response.json({ error: message, code }, { status });
}

export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const ownerUserId = process.env.MERCADO_PAGO_OWNER_FIREBASE_UID?.trim() ?? "";
    if (!ownerUserId || ownerUserId !== identity.uid) {
      return Response.json({ error: "Esta conta não pode importar pagamentos do Mercado Pago." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { identifier?: string };
    const identifier = String(body.identifier ?? "").trim();
    const payment = await findMercadoPagoPayment(identifier);
    if (!payment) return Response.json({ error: "Pagamento não encontrado. Confira o ID ou a referência Pix." }, { status: 404 });

    const storedPayment = await upsertMercadoPagoPayment(identity, payment);
    const preview = mercadoPagoImportPreview(payment);
    const transactions = await listUserCollection(identity, "transactions", 500);
    const existing = transactions.find((transaction) => String(transaction.providerTransactionId ?? "") === preview.paymentId);

    return Response.json({
      payment: preview,
      alreadyImported: Boolean(existing),
      existingTransaction: existing ? { id: existing.id, description: String(existing.description ?? "Movimentação importada") } : null,
      syncedAt: storedPayment.lastSyncedAt,
    });
  } catch (error) {
    return paymentLookupError(error);
  }
}

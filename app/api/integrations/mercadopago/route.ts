import { getAISettings, getIntegrationStatus } from "../../../lib/server/ai-store";
import { authenticateFirebaseRequest } from "../../../lib/server/firebase-rest";
import { isAuthorizedMercadoPagoIdentity } from "../../../lib/server/financial-security";
import { syncMercadoPagoPayments } from "../../../lib/server/mercado-pago";
import { listReconciliation, reconcileMercadoPago } from "../../../lib/server/reconciliation";

function integrationError(error: unknown) {
  if (error instanceof Response) return error;
  const code = error instanceof Error ? error.message : "UNKNOWN";
  console.error("Mercado Pago integration error", { code });
  const messages: Record<string, [string, number]> = {
    MERCADO_PAGO_NOT_CONFIGURED: ["Configure MERCADO_PAGO_ACCESS_TOKEN para ativar a sincronização.", 503],
    FIREBASE_NOT_CONFIGURED: ["Configure as variáveis do Firebase na Vercel e publique novamente.", 503],
  };
  const [message, status] = messages[code] ?? ["Mercado Pago temporariamente indisponível. Os dados locais continuam funcionando.", 502];
  return Response.json({ error: message, code }, { status });
}

export async function GET(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    if (process.env.MERCADO_PAGO_ACCESS_TOKEN && !isAuthorizedMercadoPagoIdentity(identity)) {
      return Response.json({ configured: false, restricted: true, sync: { status: "not_configured", lastSyncedAt: null, lastError: null, recordsChecked: 0 }, problems: [] });
    }
    const [sync, reconciliation] = await Promise.all([getIntegrationStatus(identity), listReconciliation(identity)]);
    const problems = reconciliation.filter((item) => item.status !== "CONCILIADO").sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 100);
    return Response.json({ configured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN), sync, problems });
  } catch (error) {
    return integrationError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    if (!isAuthorizedMercadoPagoIdentity(identity)) return Response.json({ error: "Esta conta não pode acessar a integração Mercado Pago." }, { status: 403 });
    const settings = await getAISettings(identity);
    if (!settings.mercadoPagoEnabled) return Response.json({ error: "Ative a conciliação Mercado Pago nas configurações da PSYZON AI." }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { beginDate?: string; endDate?: string };
    const sync = await syncMercadoPagoPayments(identity, body.beginDate, body.endDate);
    const reconciliation = await reconcileMercadoPago(identity);
    return Response.json({ sync, reconciliation });
  } catch (error) {
    return integrationError(error);
  }
}

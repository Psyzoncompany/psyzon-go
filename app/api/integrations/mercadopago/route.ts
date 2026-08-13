import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { financialReconciliation } from "../../../../db/schema";
import { getAISettings, getIntegrationStatus } from "../../../lib/server/ai-store";
import { authenticateFirebaseRequest } from "../../../lib/server/firebase-rest";
import { syncMercadoPagoPayments } from "../../../lib/server/mercado-pago";
import { reconcileMercadoPago } from "../../../lib/server/reconciliation";

function integrationError(error: unknown) {
  if (error instanceof Response) return error;
  const code = error instanceof Error ? error.message : "UNKNOWN";
  console.error("Mercado Pago integration error", { code });
  const message = code === "MERCADO_PAGO_NOT_CONFIGURED" ? "Configure MERCADO_PAGO_ACCESS_TOKEN para ativar a sincronização." : "Mercado Pago temporariamente indisponível. Os dados locais continuam funcionando.";
  return Response.json({ error: message, code }, { status: code === "MERCADO_PAGO_NOT_CONFIGURED" ? 503 : 502 });
}

export async function GET(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const ownerUserId = process.env.MERCADO_PAGO_OWNER_FIREBASE_UID?.trim() ?? "";
    if (process.env.MERCADO_PAGO_ACCESS_TOKEN && (!ownerUserId || ownerUserId !== identity.uid)) return Response.json({ configured: false, restricted: true, sync: { status: "not_configured", lastSyncedAt: null, lastError: null, recordsChecked: 0 }, problems: [] });
    const [sync, problems] = await Promise.all([
      getIntegrationStatus(identity.uid),
      getDb().select().from(financialReconciliation).where(and(eq(financialReconciliation.ownerUserId, identity.uid), ne(financialReconciliation.status, "CONCILIADO"))).orderBy(desc(financialReconciliation.updatedAt)).limit(100),
    ]);
    return Response.json({ configured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN), sync, problems });
  } catch (error) { return integrationError(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const ownerUserId = process.env.MERCADO_PAGO_OWNER_FIREBASE_UID?.trim() ?? "";
    if (!ownerUserId || ownerUserId !== identity.uid) return Response.json({ error: "Configure o UID proprietário da integração Mercado Pago." }, { status: 403 });
    const settings = await getAISettings(identity.uid);
    if (!settings.mercadoPagoEnabled) return Response.json({ error: "Ative a conciliação Mercado Pago nas configurações da PSYZON AI." }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { beginDate?: string; endDate?: string };
    const sync = await syncMercadoPagoPayments(identity.uid, body.beginDate, body.endDate);
    const reconciliation = await reconcileMercadoPago(identity);
    return Response.json({ sync, reconciliation });
  } catch (error) { return integrationError(error); }
}

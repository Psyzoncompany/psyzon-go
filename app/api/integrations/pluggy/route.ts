import { authenticateFirebaseRequest } from "../../../lib/server/firebase-rest";
import { enforcePluggyRateLimit, isGoogleIdentity } from "../../../lib/server/financial-security";
import { getPluggyDashboard, isPluggyConfigured, registerPluggyItem, syncAllPluggyItems, syncPluggyItem } from "../../../lib/server/pluggy";

export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };
const ITEM_ID = /^[a-f0-9-]{20,80}$/i;

function integrationError(error: unknown) {
  if (error instanceof Response) return error;
  const rawCode = error instanceof Error ? error.message : "UNKNOWN";
  const responses: Record<string, [string, number]> = {
    PLUGGY_NOT_CONFIGURED: ["A integração Pluggy ainda não foi configurada no servidor.", 503],
    PLUGGY_ITEM_FORBIDDEN: ["A conexão bancária não pertence a esta conta.", 403],
  };
  const code = rawCode in responses ? rawCode : "PLUGGY_UPSTREAM_ERROR";
  const [message, status] = responses[code] ?? ["A Pluggy está temporariamente indisponível. Os dados já sincronizados continuam acessíveis.", 502];
  console.error("Pluggy integration error", { code });
  return Response.json({ error: message, code }, { status, headers: PRIVATE_HEADERS });
}

async function identityFor(request: Request) {
  const identity = await authenticateFirebaseRequest(request);
  if (!isGoogleIdentity(identity)) throw new Response("Conta Google verificada necessária.", { status: 403 });
  return identity;
}

export async function GET(request: Request) {
  try {
    const identity = await identityFor(request);
    if (!isPluggyConfigured()) {
      return Response.json({ configured: false, webhookConfigured: false, paymentsPrepared: true, paymentsEnabled: false, sync: { status: "not_configured", lastSyncedAt: null, lastError: null, recordsChecked: 0 }, items: [], accounts: [], transactions: [], reconciliation: { pending: 0, matched: 0 } }, { headers: PRIVATE_HEADERS });
    }
    return Response.json(await getPluggyDashboard(identity), { headers: PRIVATE_HEADERS });
  } catch (error) {
    return integrationError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await identityFor(request);
    const limit = await enforcePluggyRateLimit(identity, request);
    if (!limit.allowed) return Response.json({ error: "Limite de sincronizações atingido. Tente novamente em alguns minutos." }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": String(limit.retryAfter) } });
    const body = await request.json().catch(() => ({})) as { action?: unknown; itemId?: unknown };
    const action = body.action;
    const itemId = typeof body.itemId === "string" ? body.itemId : "";
    if (!['sync', 'register'].includes(String(action))) return Response.json({ error: "Ação inválida." }, { status: 400, headers: PRIVATE_HEADERS });
    if (itemId && !ITEM_ID.test(itemId)) return Response.json({ error: "Item bancário inválido." }, { status: 400, headers: PRIVATE_HEADERS });
    const result = action === "register"
      ? await registerPluggyItem(identity, itemId)
      : itemId ? await syncPluggyItem(identity.uid, itemId) : await syncAllPluggyItems(identity);
    return Response.json({ ok: true, result }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return integrationError(error);
  }
}

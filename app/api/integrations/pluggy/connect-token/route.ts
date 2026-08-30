import { authenticateFirebaseRequest } from "../../../../lib/server/firebase-rest";
import { enforcePluggyRateLimit, isGoogleIdentity } from "../../../../lib/server/financial-security";
import { createPluggyConnectToken, ensurePluggyWebhookOnce } from "../../../../lib/server/pluggy";

export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };
const ITEM_ID = /^[a-f0-9-]{20,80}$/i;

function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  const rawCode = error instanceof Error ? error.message : "UNKNOWN";
  const responses: Record<string, [string, number]> = {
    PLUGGY_NOT_CONFIGURED: ["Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor.", 503],
    PLUGGY_ITEM_FORBIDDEN: ["A conexão bancária não pertence a esta conta.", 403],
    PLUGGY_WEBHOOK_URL_INVALID: ["PLUGGY_WEBHOOK_URL deve ser uma URL HTTPS pública.", 503],
  };
  const code = rawCode in responses ? rawCode : "PLUGGY_UPSTREAM_ERROR";
  const [message, status] = responses[code] ?? ["Não foi possível iniciar a conexão bancária.", 502];
  console.error("Pluggy connect token error", { code });
  return Response.json({ error: message, code }, { status, headers: PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    if (!isGoogleIdentity(identity)) return Response.json({ error: "Conta Google verificada necessária." }, { status: 403, headers: PRIVATE_HEADERS });
    const limit = await enforcePluggyRateLimit(identity, request);
    if (!limit.allowed) return Response.json({ error: "Muitas tentativas. Aguarde antes de abrir uma nova conexão." }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": String(limit.retryAfter) } });
    const body = await request.json().catch(() => ({})) as { itemId?: unknown };
    const itemId = typeof body.itemId === "string" && body.itemId ? body.itemId : undefined;
    if (itemId && !ITEM_ID.test(itemId)) return Response.json({ error: "Item bancário inválido." }, { status: 400, headers: PRIVATE_HEADERS });
    await ensurePluggyWebhookOnce();
    const token = await createPluggyConnectToken(identity, itemId);
    return Response.json({
      accessToken: token.accessToken,
      includeSandbox: process.env.PLUGGY_INCLUDE_SANDBOX === "true" && process.env.NODE_ENV !== "production",
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

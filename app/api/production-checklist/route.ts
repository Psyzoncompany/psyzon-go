import { authenticateFirebaseRequest } from "../../lib/server/firebase-rest";
import { enforceProductionRateLimit } from "../../lib/server/financial-security";
import { organizeProductionWithAI } from "../../lib/server/production-organizer";

const headers = { "cache-control": "private, no-store" };
export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const limit = await enforceProductionRateLimit(identity, request);
    if (!limit.allowed) return Response.json({ error: "Aguarde um pouco antes de organizar outra lista." }, { status: 429, headers: { ...headers, "retry-after": String(limit.retryAfter) } });
    if (Number(request.headers.get("content-length") || 0) > 130000) return Response.json({ error: "A lista está muito grande." }, { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 40000) return Response.json({ error: "A lista está muito grande." }, { status: 413, headers });
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "Envie uma lista válida." }, { status: 400, headers }); }
    if (typeof body?.text !== "string" || !body.text.trim() || body.text.length > 30000) return Response.json({ error: "Cole uma lista de até 30 mil caracteres." }, { status: 400, headers });
    const checklist = await organizeProductionWithAI(body.text);
    return Response.json({ checklist }, { headers });
  } catch (cause) {
    if (cause instanceof Response) return Response.json({ error: "Entre novamente para organizar com IA." }, { status: cause.status, headers });
    const code = cause instanceof Error ? cause.message : "UNKNOWN";
    const error = code === "PRODUCTION_AI_NOT_CONFIGURED" ? "A IA ainda não está configurada. Você pode usar Organizar lista para continuar." : "A IA não conseguiu organizar esta lista agora. Use Organizar lista ou tente novamente.";
    return Response.json({ error }, { status: 503, headers });
  }
}

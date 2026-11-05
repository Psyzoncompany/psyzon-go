import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getAdminFirestore } from "../../lib/server/firebase-admin";
import { authenticateFirebaseRequest } from "../../lib/server/firebase-rest";
import { enforcePrivacyRateLimit } from "../../lib/server/financial-security";

const headers = { "cache-control": "private, no-store" };
const deriveKey = promisify(scrypt);

export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const payload = await request.json().catch(() => null);
    const pin = payload?.pin;
    if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
      return Response.json({ error: "Digite os seis números da senha." }, { status: 400, headers });
    }

    const limit = await enforcePrivacyRateLimit(identity, request);
    if (!limit.allowed) {
      return Response.json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, { status: 429, headers: { ...headers, "retry-after": String(limit.retryAfter) } });
    }
    const settings = (await getAdminFirestore().doc("privateSettings/valuesPrivacy").get()).data();
    if (!settings || typeof settings.salt !== "string" || !/^[a-f0-9]{64}$/.test(settings.hash ?? "")) {
      return Response.json({ error: "A senha ainda não está configurada." }, { status: 503, headers });
    }
    const provided = (await deriveKey(pin, settings.salt, 32)) as Buffer;
    if (!timingSafeEqual(provided, Buffer.from(settings.hash, "hex"))) {
      return Response.json({ error: "Senha incorreta." }, { status: 403, headers });
    }
    return new Response(null, { status: 204, headers });
  } catch (error) {
    const status = error instanceof Response && error.status === 401 ? 401 : 503;
    const message = status === 401 ? "Entre novamente para alterar a visibilidade." : "Não foi possível verificar a senha. Tente novamente.";
    return Response.json({ error: message }, { status, headers });
  }
}

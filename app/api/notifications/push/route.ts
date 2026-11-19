import { authenticateFirebaseRequest } from "../../../lib/server/firebase-rest";
import { parseDevice, pushCredentials, pushEndpoint, registerPushDevice, removePushDevice, testPushDevice } from "../../../lib/server/web-push";

export const runtime = "nodejs";

const headers = { "cache-control": "private, no-store" };
const empty = () => new Response(null, { status: 204, headers });
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export function GET() {
  const keys = pushCredentials();
  return keys ? Response.json({ publicKey: keys.publicKey }, { headers }) : fail("Avisos em segundo plano indisponíveis.", 503);
}

async function handle(request: Request) {
  try {
    const { uid } = await authenticateFirebaseRequest(request);
    const text = await request.text();
    if (text.length > 4096) return fail("Dados do dispositivo inválidos.", 400);
    const body = JSON.parse(text);
    if (request.method === "PUT") {
      if (!pushCredentials()) return fail("Avisos em segundo plano indisponíveis.", 503);
      const device = parseDevice(body);
      if (!device) return fail("Dispositivo incompatível com Web Push.", 400);
      return await registerPushDevice(uid, device) ? empty() : fail("Reative as notificações neste dispositivo.", 409);
    }

    const endpoint = pushEndpoint(body?.endpoint);
    if (!endpoint) return fail("Dispositivo inválido.", 400);
    if (request.method === "DELETE") {
      await removePushDevice(uid, endpoint);
      return empty();
    }

    const result = await testPushDevice(uid, endpoint);
    if (result === "sent") return empty();
    if (result === "limited") return fail("Aguarde um minuto para enviar outro teste.", 429);
    if (result === "missing" || result === "expired") return fail("Reative as notificações neste dispositivo.", 410);
    return fail("O teste não foi aceito pelo serviço de notificações.", 502);
  } catch (error) {
    if (error instanceof SyntaxError) return fail("Dados do dispositivo inválidos.", 400);
    if (error instanceof Response && error.status === 401) return fail("Entre novamente para configurar as notificações.", 401);
    console.error("Falha ao configurar Web Push");
    return fail("Não foi possível configurar as notificações. Tente novamente.", 503);
  }
}

export const PUT = handle;
export const POST = handle;
export const DELETE = handle;

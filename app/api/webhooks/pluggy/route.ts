import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { processPluggyWebhook, type PluggyWebhookPayload } from "../../../lib/server/pluggy";

export const runtime = "nodejs";

function sameSecret(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const expected = process.env.PLUGGY_WEBHOOK_SECRET?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (!expected || !sameSecret(authorization, `Bearer ${expected}`)) {
    return Response.json({ error: "Webhook não autorizado." }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as PluggyWebhookPayload | null;
  if (!body || typeof body.event !== "string" || typeof body.eventId !== "string") {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }
  // A Pluggy exige resposta rápida; o Next mantém esta tarefa viva após o 202.
  after(async () => {
    await processPluggyWebhook(body).catch((error) => {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      console.error("Pluggy webhook processing failed", { code });
    });
  });
  return Response.json({ accepted: true }, { status: 202 });
}

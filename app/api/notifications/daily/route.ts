import { timingSafeEqual } from "node:crypto";
import { dispatchDailyPush, notificationDay, pushCredentials } from "../../../lib/server/web-push";

export const runtime = "nodejs";
export const maxDuration = 60;

const headers = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !pushCredentials()) return Response.json({ error: "Not configured" }, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const stats = await dispatchDailyPush(notificationDay());
    if (stats.failed) console.error("Falhas no envio diário do Web Push", stats);
    return Response.json(stats, { headers });
  } catch {
    console.error("Falha ao executar envio diário do Web Push");
    return Response.json({ error: "Delivery failed" }, { status: 503, headers });
  }
}

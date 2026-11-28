import { timingSafeEqual } from "node:crypto";
import { runWeeklyBackups } from "../../../lib/server/backups";

export const maxDuration = 300;
const headers = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Agendamento não configurado." }, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`), received = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return Response.json({ error: "Não autorizado." }, { status: 401, headers });
  try {
    const stats = await runWeeklyBackups();
    if (stats.failed) console.error("Backup semanal: falha em uma ou mais contas", stats);
    return Response.json(stats, { status: stats.failed ? 503 : 200, headers });
  } catch {
    console.error("Falha ao executar o backup semanal");
    return Response.json({ error: "Backup semanal não concluído." }, { status: 503, headers });
  }
}

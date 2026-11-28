import { authenticateFirebaseRequest } from "../../lib/server/firebase-rest";
import { backupStatus, createBackup, prepareRestore, readBackup, restoreBackup } from "../../lib/server/backups";
import { getAdminFirestore } from "../../lib/server/firebase-admin";

export const maxDuration = 300;
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const errors: Record<string, [number, string]> = {
  BACKUP_BUSY: [409, "Há uma cópia ou recuperação em andamento."],
  BACKUP_INVALID_ID: [400, "Cópia inválida."],
  BACKUP_NOT_FOUND: [404, "Cópia não encontrada nesta conta."],
  BACKUP_CHECKSUM_FAILED: [422, "A integridade da cópia não foi confirmada. Nenhum dado será recuperado dessa cópia."],
  BACKUP_PREVIEW_EXPIRED: [409, "A prévia expirou ou já foi usada. Confira a recuperação novamente."],
  BACKUP_DATA_CHANGED: [409, "Os dados mudaram após a conferência. Abra uma nova prévia antes de recuperar."],
  BACKUP_ROLLBACK_FAILED: [503, "A recuperação foi interrompida. A cópia anterior está preservada. Confira os dados antes de continuar."],
  BACKUP_RESTORE_VERIFICATION_FAILED: [503, "A recuperação não passou na conferência. Os dados anteriores foram recolocados."],
};
function fail(error: unknown) {
  if (error instanceof Response) return error;
  const code = error instanceof Error ? error.message : "unknown";
  const [status, message] = errors[code] ?? [503, "Não foi possível concluir. Tente novamente."];
  console.error("Operação de backup não concluída", { code: code.startsWith("BACKUP_") ? code : "internal" });
  return Response.json({ error: message }, { status, headers });
}

export async function GET(request: Request) {
  try {
    const { uid } = await authenticateFirebaseRequest(request, true);
    const url = new URL(request.url);
    if (url.searchParams.get("download")) {
      const { bytes, info } = await readBackup(getAdminFirestore(), uid, url.searchParams.get("download")!);
      // Stream archives so photos and long histories are not truncated by the
      // platform's buffered-response size limit. Download requires authentication.
      const stream = new ReadableStream<Uint8Array>({
        start(controller) { for (let i = 0; i < bytes.length; i += 64 * 1024) controller.enqueue(new Uint8Array(bytes.subarray(i, i + 64 * 1024))); controller.close(); },
      });
      return new Response(stream, { headers: { ...headers, "content-type": "application/gzip", "content-disposition": `attachment; filename="psyzon-backup-${info.createdAt.slice(0, 10)}.json.gz"` } });
    }
    return Response.json(await backupStatus(uid), { headers });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    const { uid } = await authenticateFirebaseRequest(request, true);
    if (Number(request.headers.get("content-length") || 0) > 4096) return Response.json({ error: "Requisição muito grande." }, { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 4096) return Response.json({ error: "Requisição muito grande." }, { status: 413, headers });
    let body: { action?: string; id?: string; token?: string; confirmed?: boolean };
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "Requisição inválida." }, { status: 400, headers }); }
    if (body?.action === "create") return Response.json(await createBackup(uid), { headers });
    if (body?.action === "preview" && typeof body.id === "string") return Response.json(await prepareRestore(uid, body.id), { headers });
    if (body?.action === "restore" && typeof body.token === "string" && body.confirmed === true) return Response.json(await restoreBackup(uid, body.token), { headers });
    return Response.json({ error: "Confirme uma prévia válida para recuperar os dados." }, { status: 400, headers });
  } catch (error) { return fail(error); }
}

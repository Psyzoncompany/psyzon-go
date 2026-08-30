import { authenticateFirebaseRequest } from "../../../../lib/server/firebase-rest";
import { isGoogleIdentity } from "../../../../lib/server/financial-security";
import { reconcilePluggyTransaction } from "../../../../lib/server/pluggy";

export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };
const DOCUMENT_ID = /^[A-Za-z0-9_-]{8,180}$/;

export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    if (!isGoogleIdentity(identity)) return Response.json({ error: "Conta Google verificada necessária." }, { status: 403, headers: PRIVATE_HEADERS });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = body?.action;
    const bankTransactionId = body?.bankTransactionId;
    const systemTransactionId = body?.systemTransactionId;
    if (!['match', 'import', 'ignore', 'unlink'].includes(String(action)) || typeof bankTransactionId !== "string" || !DOCUMENT_ID.test(bankTransactionId)) {
      return Response.json({ error: "Solicitação de conciliação inválida." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    if (action === "match" && (typeof systemTransactionId !== "string" || !DOCUMENT_ID.test(systemTransactionId))) {
      return Response.json({ error: "Movimentação financeira inválida." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const result = await reconcilePluggyTransaction(identity, {
      action: action as "match" | "import" | "ignore" | "unlink",
      bankTransactionId,
      systemTransactionId: typeof systemTransactionId === "string" ? systemTransactionId : undefined,
      account: body?.account === "personal" ? "personal" : "business",
      category: typeof body?.category === "string" ? body.category.slice(0, 100) : undefined,
    });
    return Response.json({ ok: true, result }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof Response) return error;
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const notFound = code.includes("NOT_FOUND");
    const conflict = ["PLUGGY_TRANSACTION_PENDING", "PLUGGY_SYSTEM_TRANSACTION_ALREADY_MATCHED", "PLUGGY_RECONCILIATION_BUSINESS_ONLY", "PLUGGY_INTERNAL_TRANSFER_NOT_RECONCILABLE"].includes(code);
    console.error("Pluggy reconciliation error", { code });
    const message = notFound ? "Movimentação não encontrada." : code === "PLUGGY_TRANSACTION_PENDING" ? "A movimentação ainda está pendente no banco." : code === "PLUGGY_SYSTEM_TRANSACTION_ALREADY_MATCHED" ? "Esse registro financeiro já está conciliado com outra movimentação." : "Não foi possível concluir a conciliação.";
    const contextualMessage = code === "PLUGGY_RECONCILIATION_BUSINESS_ONLY"
      ? "A conciliação com os registros do sistema está disponível apenas para contas da empresa."
      : code === "PLUGGY_INTERNAL_TRANSFER_NOT_RECONCILABLE"
        ? "Transferências entre contas próprias não entram como receita ou despesa."
        : message;
    return Response.json({ error: contextualMessage, code }, { status: notFound ? 404 : conflict ? 409 : 502, headers: PRIVATE_HEADERS });
  }
}

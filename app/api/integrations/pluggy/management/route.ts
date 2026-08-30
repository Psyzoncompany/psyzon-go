import { authenticateFirebaseRequest } from "../../../../lib/server/firebase-rest";
import { enforcePluggyRateLimit, isGoogleIdentity } from "../../../../lib/server/financial-security";
import {
  categorizePluggyTransaction,
  deleteFinancialCategory,
  deleteFinancialRule,
  saveFinancialCategory,
  saveFinancialRule,
  setInternalTransfer,
  updatePluggyAccountScope,
} from "../../../../lib/server/pluggy";

export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };
const DOCUMENT_ID = /^[A-Za-z0-9_-]{4,180}$/;
const ICON = /^[a-z0-9-]{2,40}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

function documentId(value: unknown) {
  return typeof value === "string" && DOCUMENT_ID.test(value) ? value : "";
}
function scope(value: unknown) {
  return value === "business" ? "business" as const : value === "personal" ? "personal" as const : null;
}

function managementError(error: unknown) {
  if (error instanceof Response) return error;
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const clientErrors = new Set([
    "FINANCIAL_CATEGORY_NOT_FOUND",
    "FINANCIAL_CATEGORY_SCOPE_MISMATCH",
    "FINANCIAL_CATEGORY_DEPTH_INVALID",
    "FINANCIAL_CATEGORY_PARENT_INVALID",
    "FINANCIAL_RULE_PATTERN_INVALID",
    "FINANCIAL_RULE_NOT_FOUND",
    "PLUGGY_ACCOUNT_NOT_FOUND",
    "PLUGGY_TRANSACTION_NOT_FOUND",
    "PLUGGY_TRANSFER_PAIR_REQUIRED",
    "PLUGGY_TRANSFER_PAIR_NOT_FOUND",
    "PLUGGY_TRANSFER_PAIR_INVALID",
  ]);
  const messages: Record<string, string> = {
    FINANCIAL_CATEGORY_NOT_FOUND: "Categoria não encontrada.",
    FINANCIAL_CATEGORY_SCOPE_MISMATCH: "A categoria pertence a outro perfil financeiro.",
    FINANCIAL_CATEGORY_DEPTH_INVALID: "Subcategorias aceitam apenas um nível abaixo da categoria principal.",
    FINANCIAL_CATEGORY_PARENT_INVALID: "Categoria principal inválida.",
    FINANCIAL_RULE_PATTERN_INVALID: "Informe um nome ou descrição válida para a regra.",
    FINANCIAL_RULE_NOT_FOUND: "Regra automática não encontrada.",
    PLUGGY_ACCOUNT_NOT_FOUND: "Conta bancária não encontrada.",
    PLUGGY_TRANSACTION_NOT_FOUND: "Movimentação bancária não encontrada.",
    PLUGGY_TRANSFER_PAIR_REQUIRED: "Selecione as duas movimentações da transferência.",
    PLUGGY_TRANSFER_PAIR_NOT_FOUND: "A outra movimentação da transferência não foi encontrada.",
    PLUGGY_TRANSFER_PAIR_INVALID: "As movimentações não formam uma transferência entre contas próprias.",
  };
  console.error("Pluggy management error", { code });
  return Response.json({ error: messages[code] ?? "Não foi possível salvar a alteração financeira.", code }, {
    status: clientErrors.has(code) ? 400 : 502,
    headers: PRIVATE_HEADERS,
  });
}

export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    if (!isGoogleIdentity(identity)) return Response.json({ error: "Conta Google verificada necessária." }, { status: 403, headers: PRIVATE_HEADERS });
    const limit = await enforcePluggyRateLimit(identity, request);
    if (!limit.allowed) return Response.json({ error: "Muitas alterações em sequência. Aguarde alguns minutos." }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": String(limit.retryAfter) } });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = body?.action;
    if (!body || typeof action !== "string") return Response.json({ error: "Ação inválida." }, { status: 400, headers: PRIVATE_HEADERS });

    let result: unknown;
    if (action === "account_scope") {
      const accountId = documentId(body.accountId);
      const accountScope = scope(body.scope);
      if (!accountId || !accountScope) throw new Error("PLUGGY_ACCOUNT_NOT_FOUND");
      result = await updatePluggyAccountScope(identity, accountId, accountScope);
    } else if (action === "category_save") {
      const categoryScope = scope(body.scope);
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      const kind = ["income", "expense", "both"].includes(String(body.kind)) ? body.kind as "income" | "expense" | "both" : null;
      const icon = typeof body.icon === "string" && ICON.test(body.icon) ? body.icon : "circle-dot";
      const color = typeof body.color === "string" && COLOR.test(body.color) ? body.color : "#64748b";
      if (!categoryScope || !kind || name.length < 1) return Response.json({ error: "Preencha nome, perfil e tipo da categoria." }, { status: 400, headers: PRIVATE_HEADERS });
      result = await saveFinancialCategory(identity, {
        id: documentId(body.id) || undefined,
        name,
        scope: categoryScope,
        kind,
        icon,
        color,
        parentId: documentId(body.parentId) || null,
      });
    } else if (action === "category_delete") {
      const categoryId = documentId(body.categoryId);
      if (!categoryId) throw new Error("FINANCIAL_CATEGORY_NOT_FOUND");
      result = await deleteFinancialCategory(identity, categoryId);
    } else if (action === "rule_save") {
      const ruleScope = scope(body.scope);
      const categoryId = documentId(body.categoryId);
      const pattern = typeof body.pattern === "string" ? body.pattern : "";
      if (!ruleScope || !categoryId) throw new Error("FINANCIAL_RULE_PATTERN_INVALID");
      result = await saveFinancialRule(identity, { id: documentId(body.id) || undefined, scope: ruleScope, categoryId, pattern, enabled: body.enabled !== false });
    } else if (action === "rule_delete") {
      const ruleId = documentId(body.ruleId);
      if (!ruleId) throw new Error("FINANCIAL_RULE_NOT_FOUND");
      result = await deleteFinancialRule(identity, ruleId);
    } else if (action === "transaction_category") {
      const transactionId = documentId(body.transactionId);
      const categoryId = body.categoryId === null || body.categoryId === "" ? null : documentId(body.categoryId);
      if (!transactionId || (body.categoryId && !categoryId)) throw new Error("PLUGGY_TRANSACTION_NOT_FOUND");
      result = await categorizePluggyTransaction(identity, {
        transactionId,
        categoryId,
        applyRule: body.applyRule === true,
        rulePattern: typeof body.rulePattern === "string" ? body.rulePattern.slice(0, 100) : undefined,
      });
    } else if (action === "internal_transfer") {
      const transactionId = documentId(body.transactionId);
      const pairId = documentId(body.pairId) || undefined;
      if (!transactionId) throw new Error("PLUGGY_TRANSACTION_NOT_FOUND");
      result = await setInternalTransfer(identity, transactionId, pairId, body.internal !== false);
    } else {
      return Response.json({ error: "Ação inválida." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    return Response.json({ ok: true, result }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return managementError(error);
  }
}

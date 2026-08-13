import type { AIResponsePayload, AISettings } from "../../ai/types";
import { runPSYZONAgent } from "../../lib/server/ai-agent";
import {
  checkRateLimit,
  deleteConversation,
  ensureConversation,
  getAISettings,
  getConversationMessages,
  getIntegrationStatus,
  getPendingConfirmation,
  listConversations,
  resolveConfirmation,
  saveAISettings,
  saveMessage,
  titleConversation,
} from "../../lib/server/ai-store";
import { executeConfirmedTool } from "../../lib/server/ai-tools";
import { authenticateFirebaseRequest } from "../../lib/server/firebase-rest";

function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, [string, number]> = {
    GEMINI_NOT_CONFIGURED: ["A PSYZON AI está pronta, mas a chave GEMINI_API_KEY ainda precisa ser configurada.", 503],
    AI_DATABASE_NOT_CONFIGURED: ["O banco da PSYZON AI ainda não foi configurado neste ambiente. Na Vercel, adicione TURSO_DATABASE_URL e TURSO_AUTH_TOKEN.", 503],
    AI_DISABLED: ["A PSYZON AI está desativada nas configurações.", 403],
    TOOL_LOOP_LIMIT: ["Interrompi uma sequência longa de consultas para manter a operação segura. Reformule o pedido em uma análise por vez.", 422],
  };
  const [message, status] = messages[code] ?? ["A PSYZON AI não conseguiu concluir agora. O restante do sistema continua funcionando normalmente.", 500];
  console.error("PSYZON AI request failed", { code });
  return Response.json({ error: message, code }, { status });
}

function cleanQuestion(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").trim().slice(0, 4000);
}

export async function GET(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    if (conversationId) return Response.json({ messages: await getConversationMessages(identity.uid, conversationId) });
    const [settings, conversations, sync] = await Promise.all([getAISettings(identity.uid), listConversations(identity.uid), getIntegrationStatus(identity.uid)]);
    return Response.json({
      settings,
      conversations,
      integrations: {
        gemini: { configured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash" },
        mercadoPago: { configured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN && process.env.MERCADO_PAGO_OWNER_FIREBASE_UID === identity.uid), enabled: settings.mercadoPagoEnabled, status: sync.status, lastSyncedAt: sync.lastSyncedAt, lastError: sync.lastError, recordsChecked: sync.recordsChecked },
      },
    });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const rate = await checkRateLimit(identity.uid);
    if (!rate.allowed) return Response.json({ error: "Muitas solicitações em pouco tempo. Aguarde alguns segundos.", retryAfter: rate.retryAfter }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "message";
    const settings = await getAISettings(identity.uid);

    if (action === "confirm") {
      const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId : "";
      const pending = await getPendingConfirmation(identity.uid, confirmationId);
      if (!pending) return Response.json({ error: "Esta confirmação expirou ou já foi resolvida." }, { status: 409 });
      if (settings.permissionMode !== "financial_confirm") return Response.json({ error: "A permissão atual não autoriza alterações financeiras." }, { status: 403 });
      const result = await executeConfirmedTool(pending.tool, pending.arguments, { identity, conversationId: pending.conversationId ?? undefined, permissionMode: settings.permissionMode, confirmed: true });
      await resolveConfirmation(identity.uid, confirmationId, "confirmed");
      const payload: AIResponsePayload = { summary: "Alteração confirmada e concluída com sucesso.", severity: "info", metrics: [], alerts: [], recommendations: [], actions: [{ label: "Abrir financeiro", type: "navigate", target: "financeiro" }], confidence: "alta", sources: ["Ação autorizada pelo usuário", "Registro de auditoria da PSYZON AI"] };
      const message = pending.conversationId && settings.saveHistory ? await saveMessage(identity.uid, pending.conversationId, "assistant", payload.summary, payload, [pending.tool]) : { id: crypto.randomUUID(), role: "assistant" as const, content: payload.summary, payload, toolNames: [pending.tool], createdAt: Math.floor(Date.now() / 1000) };
      return Response.json({ message, result });
    }

    if (action === "cancel_confirmation") {
      const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId : "";
      await resolveConfirmation(identity.uid, confirmationId, "cancelled");
      return Response.json({ cancelled: true });
    }

    const question = cleanQuestion(body.message);
    if (!question) return Response.json({ error: "Escreva uma pergunta para a PSYZON AI." }, { status: 400 });
    const requestedConversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
    const conversation = settings.saveHistory
      ? await ensureConversation(identity.uid, requestedConversationId, "Nova conversa")
      : { id: requestedConversationId || crypto.randomUUID(), title: "Conversa privada", createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000) };
    const history = settings.saveHistory ? await getConversationMessages(identity.uid, conversation.id) : [];
    const userMessage = settings.saveHistory ? await saveMessage(identity.uid, conversation.id, "user", question) : { id: crypto.randomUUID(), role: "user" as const, content: question, createdAt: Math.floor(Date.now() / 1000) };
    if (settings.saveHistory && conversation.title === "Nova conversa") await titleConversation(identity.uid, conversation.id, question.replace(/[?.!]+$/g, "").slice(0, 64));
    const result = await runPSYZONAgent({ identity, conversationId: conversation.id, question, history });
    const assistantMessage = settings.saveHistory ? await saveMessage(identity.uid, conversation.id, "assistant", result.payload.summary, result.payload, result.toolNames) : { id: crypto.randomUUID(), role: "assistant" as const, content: result.payload.summary, payload: result.payload, toolNames: result.toolNames, createdAt: Math.floor(Date.now() / 1000) };
    return Response.json({ conversation: { ...conversation, title: conversation.title === "Nova conversa" ? question.replace(/[?.!]+$/g, "").slice(0, 64) : conversation.title }, userMessage, message: assistantMessage, model: result.model, rateLimitRemaining: rate.remaining });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const body = await request.json() as Partial<AISettings>;
    const allowed: Partial<AISettings> = {};
    if (typeof body.enabled === "boolean") allowed.enabled = body.enabled;
    if (["read_only", "administrative", "financial_confirm"].includes(String(body.permissionMode))) allowed.permissionMode = body.permissionMode;
    if (typeof body.saveHistory === "boolean") allowed.saveHistory = body.saveHistory;
    if (typeof body.showDashboardSummary === "boolean") allowed.showDashboardSummary = body.showDashboardSummary;
    if (typeof body.financialAnalysis === "boolean") allowed.financialAnalysis = body.financialAnalysis;
    if (typeof body.mercadoPagoEnabled === "boolean") allowed.mercadoPagoEnabled = body.mercadoPagoEnabled;
    return Response.json({ settings: await saveAISettings(identity.uid, allowed) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const conversationId = new URL(request.url).searchParams.get("conversationId") ?? "";
    if (!conversationId) return Response.json({ error: "Conversa não informada." }, { status: 400 });
    await deleteConversation(identity.uid, conversationId);
    return Response.json({ deleted: true });
  } catch (error) { return errorResponse(error); }
}

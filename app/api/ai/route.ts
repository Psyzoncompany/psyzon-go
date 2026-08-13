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

async function errorResponse(error: unknown) {
  if (error instanceof Response) {
    const message = await error.text().catch(() => "Não foi possível validar sua sessão.");
    return Response.json({ error: message || "Não foi possível validar sua sessão." }, { status: error.status });
  }
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, [string, number]> = {
    AI_PROVIDER_NOT_CONFIGURED: ["Configure GROQ_API_KEY para ativar a PSYZON AI.", 503],
    GROQ_KEY_INVALID: ["A chave GROQ_API_KEY foi recusada. Gere uma nova chave no Groq Console.", 503],
    GROQ_QUOTA_EXCEEDED: ["O limite gratuito da Groq foi atingido. Aguarde a renovação indicada no Groq Console.", 429],
    GROQ_MODEL_NOT_FOUND: ["O modelo definido em GROQ_MODEL não está disponível para essa conta.", 503],
    GROQ_REQUEST_INVALID: ["A Groq recusou a solicitação da PSYZON AI. Confira o modelo configurado.", 502],
    GROQ_UNAVAILABLE: ["A Groq está temporariamente indisponível. Tente novamente em alguns instantes.", 503],
    GROQ_REQUEST_FAILED: ["Não foi possível conectar à Groq. Confira a chave e tente novamente.", 502],
    GROQ_INVALID_TOOL_CALL: ["A Groq retornou uma consulta inválida. Reformule sua pergunta e tente novamente.", 422],
    GROQ_EMPTY_RESPONSE: ["A Groq não retornou uma resposta utilizável. Tente novamente.", 502],
    GROQ_STATE_LOST: ["A consulta perdeu o contexto durante o processamento. Envie a pergunta novamente.", 502],
    GEMINI_NOT_CONFIGURED: ["A PSYZON AI está pronta, mas a chave GEMINI_API_KEY ainda precisa ser configurada.", 503],
    GEMINI_KEY_INVALID: ["A chave GEMINI_API_KEY foi recusada pelo Google. Confira a chave configurada na Vercel.", 503],
    GEMINI_QUOTA_EXCEEDED: ["A cota da API Gemini foi atingida. Confira faturamento e limites no Google AI Studio.", 429],
    GEMINI_MODEL_NOT_FOUND: ["O modelo definido em GEMINI_MODEL não está disponível para essa chave.", 503],
    GEMINI_REQUEST_INVALID: ["A API Gemini recusou a configuração da solicitação. Confira o modelo e a versão da integração.", 502],
    GEMINI_UNAVAILABLE: ["A API Gemini está temporariamente indisponível. Tente novamente em alguns instantes.", 503],
    GEMINI_REQUEST_FAILED: ["Não foi possível conectar à API Gemini. Confira a chave e as restrições dela.", 502],
    AI_DISABLED: ["A PSYZON AI está desativada nas configurações.", 403],
    TOOL_LOOP_LIMIT: ["Interrompi uma sequência longa de consultas para manter a operação segura. Reformule o pedido em uma análise por vez.", 422],
    FIREBASE_SESSION_EXPIRED: ["Sua sessão do Firebase expirou. Saia da conta e entre novamente.", 401],
    FIRESTORE_PERMISSION_DENIED: ["O Firestore bloqueou o acesso da PSYZON AI. Publique as regras do arquivo firestore.rules no projeto psyzon-go.", 403],
    FIRESTORE_DATABASE_NOT_FOUND: ["O banco Firestore ainda não foi criado no projeto psyzon-go. Crie o banco no modo de produção e tente novamente.", 503],
    FIRESTORE_RATE_LIMITED: ["O Firestore recebeu solicitações demais. Aguarde alguns segundos e tente novamente.", 429],
  };
  const firestoreHttpStatus = code.startsWith("FIRESTORE_HTTP_") ? Number(code.slice("FIRESTORE_HTTP_".length)) : 0;
  const fallback: [string, number] = firestoreHttpStatus
    ? [`O Firestore respondeu com erro ${firestoreHttpStatus}. Confira a configuração do projeto Firebase.`, 502]
    : ["A PSYZON AI não conseguiu concluir agora. Confira os logs da função /api/ai na Vercel.", 500];
  const [message, status] = messages[code] ?? fallback;
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
    if (conversationId) return Response.json({ messages: await getConversationMessages(identity, conversationId) });
    const [settings, conversations, sync] = await Promise.all([getAISettings(identity), listConversations(identity), getIntegrationStatus(identity)]);
    return Response.json({
      settings,
      conversations,
      integrations: {
        ai: process.env.GROQ_API_KEY?.trim()
          ? { configured: true, provider: "Groq", model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b" }
          : process.env.GEMINI_API_KEY
            ? { configured: true, provider: "Gemini (fallback)", model: process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash" }
            : { configured: false, provider: "Groq", model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b" },
        mercadoPago: { configured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN && process.env.MERCADO_PAGO_OWNER_FIREBASE_UID === identity.uid), enabled: settings.mercadoPagoEnabled, status: sync.status, lastSyncedAt: sync.lastSyncedAt, lastError: sync.lastError, recordsChecked: sync.recordsChecked },
      },
    });
  } catch (error) { return await errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const rate = await checkRateLimit(identity);
    if (!rate.allowed) return Response.json({ error: "Muitas solicitações em pouco tempo. Aguarde alguns segundos.", retryAfter: rate.retryAfter }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "message";
    const settings = await getAISettings(identity);

    if (action === "confirm") {
      const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId : "";
      const pending = await getPendingConfirmation(identity, confirmationId);
      if (!pending) return Response.json({ error: "Esta confirmação expirou ou já foi resolvida." }, { status: 409 });
      if (settings.permissionMode !== "financial_confirm") return Response.json({ error: "A permissão atual não autoriza alterações financeiras." }, { status: 403 });
      const result = await executeConfirmedTool(pending.tool, pending.arguments, { identity, conversationId: pending.conversationId ?? undefined, permissionMode: settings.permissionMode, confirmed: true });
      await resolveConfirmation(identity, confirmationId, "confirmed");
      const payload: AIResponsePayload = { summary: "Alteração confirmada e concluída com sucesso.", severity: "info", metrics: [], alerts: [], recommendations: [], actions: [{ label: "Abrir financeiro", type: "navigate", target: "financeiro" }], confidence: "alta", sources: ["Ação autorizada pelo usuário", "Registro de auditoria da PSYZON AI"] };
      const message = pending.conversationId && settings.saveHistory ? await saveMessage(identity, pending.conversationId, "assistant", payload.summary, payload, [pending.tool]) : { id: crypto.randomUUID(), role: "assistant" as const, content: payload.summary, payload, toolNames: [pending.tool], createdAt: Math.floor(Date.now() / 1000) };
      return Response.json({ message, result });
    }

    if (action === "cancel_confirmation") {
      const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId : "";
      await resolveConfirmation(identity, confirmationId, "cancelled");
      return Response.json({ cancelled: true });
    }

    const question = cleanQuestion(body.message);
    if (!question) return Response.json({ error: "Escreva uma pergunta para a PSYZON AI." }, { status: 400 });
    const requestedConversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
    const conversation = settings.saveHistory
      ? await ensureConversation(identity, requestedConversationId, "Nova conversa")
      : { id: requestedConversationId || crypto.randomUUID(), title: "Conversa privada", createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000) };
    const history = settings.saveHistory ? await getConversationMessages(identity, conversation.id) : [];
    const userMessage = settings.saveHistory ? await saveMessage(identity, conversation.id, "user", question) : { id: crypto.randomUUID(), role: "user" as const, content: question, createdAt: Math.floor(Date.now() / 1000) };
    if (settings.saveHistory && conversation.title === "Nova conversa") await titleConversation(identity, conversation.id, question.replace(/[?.!]+$/g, "").slice(0, 64));
    const result = await runPSYZONAgent({ identity, conversationId: conversation.id, question, history });
    const assistantMessage = settings.saveHistory ? await saveMessage(identity, conversation.id, "assistant", result.payload.summary, result.payload, result.toolNames) : { id: crypto.randomUUID(), role: "assistant" as const, content: result.payload.summary, payload: result.payload, toolNames: result.toolNames, createdAt: Math.floor(Date.now() / 1000) };
    return Response.json({ conversation: { ...conversation, title: conversation.title === "Nova conversa" ? question.replace(/[?.!]+$/g, "").slice(0, 64) : conversation.title }, userMessage, message: assistantMessage, model: result.model, rateLimitRemaining: rate.remaining });
  } catch (error) { return await errorResponse(error); }
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
    return Response.json({ settings: await saveAISettings(identity, allowed) });
  } catch (error) { return await errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const identity = await authenticateFirebaseRequest(request);
    const conversationId = new URL(request.url).searchParams.get("conversationId") ?? "";
    if (!conversationId) return Response.json({ error: "Conversa não informada." }, { status: 400 });
    await deleteConversation(identity, conversationId);
    return Response.json({ deleted: true });
  } catch (error) { return await errorResponse(error); }
}
